import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import { admin } from '../db';
import { detectAnomaly, round, seasonalBaseline, stddev, mean, trend } from '../stats';
import { demGrid } from '../geo/dem';
import { delineate } from '../geo/springshed';
import { analyzeRainfall } from '../geo/rainfall';
import { bboxAround, compareEras, trueColorPng, type BBox } from '../geo/sentinel';
import type { ToolDef } from './llm';

export interface Ctx {
  escalationId: string;
  sensor: any;
  degraded: boolean;
  attempts: Record<string, number>;
  hypotheses: Record<string, any>;
  evidence: {
    rainfall?: any;
    recharge?: any;
    satellite?: any;
    flow?: any;
    sensor?: any;
  };
  dispatch?: any; // set when request_dispatch is called (the gate)
}

const PAST = { from: '2018-10-01', to: '2019-05-31' };
function recentWindow() {
  const y = new Date().getUTCFullYear();
  const m = new Date().getUTCMonth() + 1;
  const endY = m >= 6 ? y : y - 1;
  return { from: `${endY - 1}-10-01`, to: `${endY}-05-31` };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'check_sensor',
      description:
        "Sensor health: online/offline, battery, connectivity, and how old the last reading is. Run this first — if the observation itself is not trustworthy, nothing else matters.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_flow_history',
      description:
        "The spring's own discharge history: seasonal baseline for this time of year, the anomaly vs that baseline, year-on-year change, short-term trend, variability. Use it to rule normal seasonal variation in or out.",
      parameters: {
        type: 'object',
        properties: { weeks: { type: 'integer', description: 'How many weeks of history (default 104).' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_rainfall',
      description:
        'Live rainfall for this exact point (Open-Meteo / ERA5-Land, 25 years): annual normal, trailing-12-month total and anomaly, monsoon anomaly, longest dry spell. Compare the rainfall anomaly magnitude against the discharge anomaly magnitude.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'map_recharge_area',
      description:
        "Estimate where the spring's water comes from: trace the upslope contributing area across a live elevation model. Returns catchment area, elevation range, and whether it runs off the analysis edge. This is a topographic estimate, not a verified springshed.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_satellite',
      description:
        'Then-vs-now Sentinel-2 comparison of the recharge area: vegetation (NDVI) and built-up / bare surface (NDBI) change between an old dry season and a recent one, plus both true-colour images. Call map_recharge_area first. The imagery service is flaky — if it times out, just call this again.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'note_hypothesis',
      description:
        'Record or update your belief about one competing hypothesis. Call this whenever a piece of evidence changes a hypothesis.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'stable short id, e.g. H_rain, H_veg, H_road, H_abstraction, H_sensor, H_season' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['open', 'supported', 'strong', 'weak', 'eliminated'] },
          confidence: { type: 'number', description: '0..1 — probability this is a real contributing factor' },
          rationale: { type: 'string' },
        },
        required: ['code', 'label', 'status', 'confidence', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_dispatch',
      description:
        'Stop and hand to a human. You have gathered enough evidence. Draft the case for the municipal water & sanitation section and the affected ward office. You do NOT send it — a person at the municipal water desk must approve it first.',
      parameters: {
        type: 'object',
        properties: {
          primary_cause: { type: 'string' },
          confidence: { type: 'number', description: '0..1 overall confidence in the primary cause' },
          ranked_causes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                cause: { type: 'string' },
                confidence: { type: 'string', enum: ['High', 'Moderate', 'Low'] },
                evidence: { type: 'array', items: { type: 'string' } },
                counter_evidence: { type: 'array', items: { type: 'string' } },
              },
              required: ['cause', 'confidence', 'evidence'],
            },
          },
          explanation: { type: 'string', description: '3–5 sentences a ward officer can read' },
          implicated_zone: { type: 'string' },
          recommended_actions: {
            type: 'array',
            items: { type: 'object', properties: { action: { type: 'string' }, why: { type: 'string' } }, required: ['action', 'why'] },
          },
          uncertainty: { type: 'string', description: 'what still needs field verification' },
          sms_brief_ne: { type: 'string', description: 'A <=320-character SMS in NEPALI (Devanagari) for the ward office and municipal water section: spring name, how far below normal, the most likely cause in plain words, and the single recommended next step. No jargon.' },
          sms_brief_en: { type: 'string', description: 'The same brief in English.' },
        },
        required: ['primary_cause', 'confidence', 'ranked_causes', 'explanation', 'uncertainty', 'sms_brief_ne', 'sms_brief_en'],
        additionalProperties: false,
      },
    },
  },
];

// tools the agent may call while it still has autonomy (everything except the gate)
export const AUTONOMOUS_TOOLS = TOOL_DEFS.filter((t) => t.function.name !== 'request_dispatch');

export interface ToolResult {
  ok: boolean;
  summary: string; // one line for the trace
  data: unknown; // full payload for the model
  error?: string;
  retryable?: boolean;
}

export async function runTool(name: string, args: any, ctx: Ctx): Promise<ToolResult> {
  ctx.attempts[name] = (ctx.attempts[name] ?? 0) + 1;
  const attempt = ctx.attempts[name];
  const s = ctx.sensor;

  switch (name) {
    case 'check_sensor': {
      if (ctx.degraded) {
        const out = { online: false, battery_pct: 9, connectivity: 'no signal since 36h', last_reading_age_h: 41, note: 'Sensor offline — spring condition is UNKNOWN. Absence of data is not evidence the spring is fine or failing.' };
        ctx.evidence.sensor = out;
        return { ok: true, summary: 'sensor OFFLINE · last reading 41h old · status UNKNOWN', data: out };
      }
      const { data: last } = await admin
        .from('readings').select('ts').eq('sensor_id', s.id).order('ts', { ascending: false }).limit(1);
      const ageH = last?.[0] ? (Date.now() - new Date(last[0].ts).getTime()) / 3.6e6 : null;
      const out = {
        online: s.active,
        battery_pct: s.active ? 92 : 11,
        connectivity: s.active ? 'healthy' : 'no signal',
        last_reading_age_h: ageH == null ? null : round(ageH, 1),
        note: s.active
          ? 'Sensor healthy — a pure sensor-fault explanation is unlikely.'
          : 'Sensor inactive — spring condition is UNKNOWN, do not diagnose a failure.',
      };
      ctx.evidence.sensor = out;
      return { ok: true, summary: `sensor ${s.active ? 'online' : 'OFFLINE'} · battery ${out.battery_pct}% · last reading ${out.last_reading_age_h}h old`, data: out };
    }

    case 'check_flow_history': {
      const weeks = Math.min(260, Math.max(12, Number(args?.weeks) || 104));
      const since = new Date(Date.now() - weeks * 7 * 864e5).toISOString();
      const { data } = await admin
        .from('readings').select('flow_lpm, ts').eq('sensor_id', s.id).gte('ts', since).order('ts', { ascending: true });
      const series = (data ?? []).map((r) => ({ ts: r.ts as string, discharge_l_min: r.flow_lpm as number }));
      if (!series.length) return { ok: true, summary: 'no readings in window', data: { n: 0 } };
      const now = new Date();
      const cur = series[series.length - 1].discharge_l_min;
      const sb = seasonalBaseline(series, now);
      const anom = detectAnomaly(cur, series, now);
      const recent12 = series.slice(-12).map((x) => x.discharge_l_min);
      const yearAgo = series.slice(-64, -52).map((x) => x.discharge_l_min);
      const yoy = yearAgo.length ? round(((mean(recent12) - mean(yearAgo)) / mean(yearAgo)) * 100, 1) : null;
      const cv = mean(recent12) ? round((stddev(recent12) / mean(recent12)) * 100, 1) : null;
      const out = {
        current_lpm: cur,
        seasonal_baseline_lpm: Number.isFinite(sb.baseline) ? round(sb.baseline, 2) : null,
        anomaly_pct: anom.anomalyPct,
        z: anom.z,
        year_on_year_pct: yoy,
        recent_trend: trend(series.slice(-16).map((x) => x.discharge_l_min)),
        variability_cv_pct: cv,
        n_readings: series.length,
      };
      ctx.evidence.flow = out;
      return { ok: true, summary: `flow ${cur} L/min · ${anom.anomalyPct}% vs seasonal baseline (z=${anom.z}) · YoY ${yoy}%`, data: out };
    }

    case 'check_rainfall': {
      const r = await analyzeRainfall(s.lat, s.lng);
      const stale = ctx.degraded;
      const out = { ...r, stale, staleness_note: stale ? 'Latest rainfall grid is 4 days old (upstream lag). Treat monthly anomaly as indicative only.' : null };
      ctx.evidence.rainfall = out;
      return {
        ok: true,
        summary: `rainfall ${r.anomaly_pct}% vs normal · monsoon ${r.monsoon_anomaly_pct}% · dry spell ${r.dry_spell_days}d${stale ? ' · STALE 4d' : ''}`,
        data: out,
      };
    }

    case 'map_recharge_area': {
      const dem = await demGrid(s.lat, s.lng, 3.5);
      const shed = delineate(dem, s.lat, s.lng);
      const shedBox = turf.bbox(shed.polygon) as BBox;
      const aoi = clampBox(shedBox, s.lat, s.lng, 1.2, 4);
      const out = {
        polygon: shed.polygon,
        area_km2: shed.area_km2,
        elev_min_m: shed.elev_min_m,
        elev_max_m: shed.elev_max_m,
        elev_spring_m: shed.elev_spring_m,
        spring_snapped: shed.spring_snapped,
        grid_res_m: shed.grid_res_m,
        edge_truncated: shed.edge_truncated,
        stability: shed.stability,
        snap_distance_m: shed.snap_distance_m,
        on_channel: shed.on_channel,
        confidence: shed.confidence,
        confidence_reasons: shed.confidence_reasons,
        method: shed.method,
        aoi,
      };
      ctx.evidence.recharge = out;
      return {
        ok: true,
        summary: `catchment ≈ ${shed.area_km2} km² · ${shed.elev_min_m}–${shed.elev_max_m} m · estimate confidence: ${shed.confidence} (stability ${Math.round(shed.stability * 100)}%, snapped ${shed.snap_distance_m} m)${shed.edge_truncated ? ' · reaches analysis edge' : ''}`,
        data: {
          area_km2: out.area_km2, elev_min_m: out.elev_min_m, elev_max_m: out.elev_max_m,
          edge_truncated: out.edge_truncated, method: out.method,
          estimate_confidence: out.confidence,
          stability_iou: out.stability,
          snap_distance_m: out.snap_distance_m,
          confidence_note: 'This confidence is about how much to trust THIS topographic outline (there is no surveyed springshed to check against). Factor it into your own confidence and say a hydrogeologist must confirm the true recharge area.',
        },
      };
    }

    case 'compare_satellite': {
      if (!ctx.evidence.recharge) {
        return { ok: false, summary: 'must map_recharge_area first', data: { error: 'call map_recharge_area first' }, error: 'ordering' };
      }
      // Bad day: imagery genuinely unavailable.
      if (ctx.degraded) {
        const out = { valid_coverage: 'poor', unavailable: true, interpretation: 'No usable Sentinel-2 scene — heavy monsoon cloud over the whole window. Satellite evidence is unavailable for this run.' };
        ctx.evidence.satellite = out;
        return { ok: true, summary: 'satellite UNAVAILABLE — full cloud cover, proceeding without it', data: out };
      }
      // Injected transient failure on the first attempt, to demonstrate recovery
      // (the real service also fails intermittently — see README).
      if (attempt === 1) {
        return { ok: false, summary: 'imagery service timed out (504)', data: { error: 'HTTP 504 from imagery service' }, error: '504', retryable: true };
      }
      const aoi = ctx.evidence.recharge.aoi as BBox;
      const rec = recentWindow();
      const [cmp, pastPng, recentPng] = await Promise.all([
        compareEras(aoi, PAST.from, PAST.to, rec.from, rec.to),
        trueColorPng(aoi, PAST.from, PAST.to, 640).catch(() => null),
        trueColorPng(aoi, rec.from, rec.to, 640).catch(() => null),
      ]);
      const dir = path.join(process.cwd(), 'public', 'sat', ctx.escalationId);
      await mkdir(dir, { recursive: true });
      let pastUrl: string | null = null;
      let recentUrl: string | null = null;
      if (pastPng) { await writeFile(path.join(dir, 'past.png'), pastPng); pastUrl = `/sat/${ctx.escalationId}/past.png`; }
      if (recentPng) { await writeFile(path.join(dir, 'recent.png'), recentPng); recentUrl = `/sat/${ctx.escalationId}/recent.png`; }
      const out = { ...cmp, past_image: pastUrl, recent_image: recentUrl };
      ctx.evidence.satellite = out;
      return {
        ok: true,
        summary: `NDVI ${cmp.ndvi_change_pct}% · built-up ${cmp.builtup_change_pp} pp · coverage ${cmp.valid_coverage}`,
        data: { ndvi_past: cmp.ndvi_past, ndvi_recent: cmp.ndvi_recent, ndvi_change_pct: cmp.ndvi_change_pct, ndbi_past: cmp.ndbi_past, ndbi_recent: cmp.ndbi_recent, builtup_change_pp: cmp.builtup_change_pp, valid_coverage: cmp.valid_coverage, past_period: cmp.past_period, recent_period: cmp.recent_period, interpretation: cmp.interpretation },
      };
    }

    case 'note_hypothesis': {
      ctx.hypotheses[args.code] = {
        code: args.code, label: args.label, status: args.status,
        confidence: Math.max(0, Math.min(1, Number(args.confidence))), rationale: args.rationale,
      };
      return { ok: true, summary: `${args.code} "${args.label}" → ${args.status} (${Math.round(args.confidence * 100)}%)`, data: { recorded: args.code } };
    }

    default:
      return { ok: false, summary: `unknown tool ${name}`, data: { error: 'unknown tool' }, error: 'unknown' };
  }
}

function clampBox(box: BBox, lat: number, lng: number, minKm: number, maxKm: number): BBox {
  const wKm = (box[2] - box[0]) * 111 * Math.cos((lat * Math.PI) / 180);
  const hKm = (box[3] - box[1]) * 111;
  const span = Math.max(wKm, hKm);
  if (span >= minKm && span <= maxKm) return box;
  return bboxAround(lat, lng, Math.min(maxKm, Math.max(minKm, span)) / 2);
}
