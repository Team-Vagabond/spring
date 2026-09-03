import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import { admin } from '../db';
import { env } from '../env';
import { chat } from '../agent/llm';
import { demGrid } from '../geo/dem';
import { analyzeRainfall } from '../geo/rainfall';
import { bboxAround, compareEras, trueColorPng, type BBox } from '../geo/sentinel';
import { delineate } from '../geo/springshed';

// dry-season windows (Nepal: Oct–May is clear; Jun–Sep monsoon)
const PAST = { from: '2018-10-01', to: '2019-05-31' };
function recentWindow() {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const endY = m >= 6 ? y : y - 1;
  return { from: `${endY - 1}-10-01`, to: `${endY}-05-31` };
}

export async function runEscalationAnalysis(escalationId: string): Promise<void> {
  const { data: esc } = await admin.from('escalations').select('*').eq('id', escalationId).single();
  if (!esc) throw new Error('escalation not found');
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', esc.sensor_id).single();
  if (!sensor) throw new Error('sensor not found');

  await admin.from('escalations').update({ status: 'analyzing', error: null }).eq('id', escalationId);

  const { data: sig } = esc.signal_id
    ? await admin.from('signals').select('metrics').eq('id', esc.signal_id).single()
    : { data: null };
  const factors = {
    flow_anomaly_pct: sig?.metrics?.anomaly_pct ?? null,
    trend_8w_pct: sig?.metrics?.trend_8w_pct ?? null,
    long_trend: sig?.metrics?.long_trend ?? null,
    current_lpm: sig?.metrics?.current_lpm ?? null,
    seasonal_baseline_lpm: sig?.metrics?.seasonal_baseline_lpm ?? null,
  };

  const recent = recentWindow();

  try {
    // --- (1) recharge-area estimate: where does this spring's water come from? ---
    const dem = await demGrid(sensor.lat, sensor.lng, 3.5);
    const shed = delineate(dem, sensor.lat, sensor.lng);
    const shedBox = turf.bbox(shed.polygon) as BBox;
    // AOI for satellite: the recharge polygon, but never larger than ~4km or smaller than ~1.2km
    const aoi = clampBox(shedBox, sensor.lat, sensor.lng, 1.2, 4);

    // --- (2) then vs now satellite comparison over that recharge area ---
    const [comparison, pastPng, recentPng, rainfall] = await Promise.all([
      compareEras(aoi, PAST.from, PAST.to, recent.from, recent.to),
      trueColorPng(aoi, PAST.from, PAST.to, 640).catch(() => null),
      trueColorPng(aoi, recent.from, recent.to, 640).catch(() => null),
      analyzeRainfall(sensor.lat, sensor.lng),
    ]);

    const dir = path.join(process.cwd(), 'public', 'sat', escalationId);
    await mkdir(dir, { recursive: true });
    let pastUrl: string | null = null;
    let recentUrl: string | null = null;
    if (pastPng) { await writeFile(path.join(dir, 'past.png'), pastPng); pastUrl = `/sat/${escalationId}/past.png`; }
    if (recentPng) { await writeFile(path.join(dir, 'recent.png'), recentPng); recentUrl = `/sat/${escalationId}/recent.png`; }

    const recharge = {
      polygon: shed.polygon,
      area_km2: shed.area_km2,
      elev_min_m: shed.elev_min_m,
      elev_max_m: shed.elev_max_m,
      elev_spring_m: shed.elev_spring_m,
      spring_snapped: shed.spring_snapped,
      grid_res_m: shed.grid_res_m,
      edge_truncated: shed.edge_truncated,
      method: shed.method,
      aoi,
    };
    const satellite = { ...comparison, past_image: pastUrl, recent_image: recentUrl };

    // --- (3) agent verdict: weigh all of it, name the likely cause + fixes ---
    const verdict = await synthesizeVerdict(sensor, factors, rainfall, recharge, satellite);

    await admin.from('escalations').update({
      status: 'complete',
      rainfall, recharge, satellite, factors, verdict,
      models_used: verdict.__models,
      completed_at: new Date().toISOString(),
    }).eq('id', escalationId);
  } catch (e) {
    await admin.from('escalations').update({ status: 'error', error: (e as Error).message }).eq('id', escalationId);
    throw e;
  }
}

function clampBox(box: BBox, lat: number, lng: number, minKm: number, maxKm: number): BBox {
  const wKm = (box[2] - box[0]) * 111 * Math.cos((lat * Math.PI) / 180);
  const hKm = (box[3] - box[1]) * 111;
  const span = Math.max(wKm, hKm);
  if (span >= minKm && span <= maxKm) return box;
  const km = Math.min(maxKm, Math.max(minKm, span));
  return bboxAround(lat, lng, km / 2);
}

async function synthesizeVerdict(
  sensor: any,
  factors: any,
  rainfall: any,
  recharge: any,
  satellite: any,
): Promise<any> {
  const sys =
    'You are Spring Sentinel\'s investigation agent. A spring in Darchula, Nepal has been escalated for ' +
    'a sustained discharge decline. You are given: (a) the flow anomaly, (b) live rainfall analysis, ' +
    '(c) a topographic estimate of the recharge area, (d) a then-vs-now satellite comparison of that ' +
    'recharge area (vegetation NDVI and built-up NDBI). Weigh these and produce a ranked, ' +
    'uncertainty-aware explanation. Never state a cause as proven. Recommend intervention pathways, ' +
    'not engineering designs. Output strict JSON only.';
  const user = JSON.stringify({
    spring: { name: sensor.name, village: sensor.village, elevation_m: sensor.elevation_m, expected_flow_lpm: sensor.expected_flow_lpm },
    flow: factors,
    rainfall: {
      annual_normal_mm: rainfall.annual_normal_mm, last12_mm: rainfall.last12_mm,
      anomaly_pct: rainfall.anomaly_pct, monsoon_anomaly_pct: rainfall.monsoon_anomaly_pct,
      dry_spell_days: rainfall.dry_spell_days, summary: rainfall.summary,
    },
    recharge_area: {
      area_km2: recharge.area_km2, elev_min_m: recharge.elev_min_m, elev_max_m: recharge.elev_max_m,
      edge_truncated: recharge.edge_truncated, method: recharge.method,
    },
    satellite_then_vs_now: {
      past_period: satellite.past_period, recent_period: satellite.recent_period,
      ndvi_past: satellite.ndvi_past, ndvi_recent: satellite.ndvi_recent, ndvi_change_pct: satellite.ndvi_change_pct,
      ndbi_past: satellite.ndbi_past, ndbi_recent: satellite.ndbi_recent, builtup_change_pp: satellite.builtup_change_pp,
      valid_coverage: satellite.valid_coverage, interpretation: satellite.interpretation,
    },
  }, null, 1) +
    '\n\nReturn JSON: {' +
    '"primary_cause": short phrase, ' +
    '"ranked_causes": [{"cause": string, "confidence": "High"|"Moderate"|"Low", "evidence": [string], "counter_evidence": [string]}], ' +
    '"explanation": 3-5 sentences a ward officer can read, tying the evidence together, ' +
    '"implicated_zone": where in the recharge area the change is concentrated (e.g. "lower catchment near the settlement"), ' +
    '"suggestions": [ {"action": string, "why": string} ], ' +
    '"uncertainty": one sentence on what field verification is still needed}';

  const models: string[] = [];
  for (const model of [env.llmModelFrontier, env.llmModelFast]) {
    try {
      const res = await chat({
        model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        maxTokens: model === env.llmModelFrontier ? 3200 : 1800,
        temperature: 0.2,
        responseFormat: 'json_object',
      });
      models.push(res.model);
      const raw = (res.message.content ?? '').replace(/^```json\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      if (!parsed.primary_cause || !Array.isArray(parsed.ranked_causes)) throw new Error('thin verdict');
      parsed.__models = models;
      return parsed;
    } catch (err) {
      console.error(`verdict via ${model} failed:`, (err as Error).message);
      models.push(`${model} (failed)`);
    }
  }
  // deterministic fallback
  const causes: any[] = [];
  if (satellite.builtup_change_pp != null && satellite.builtup_change_pp > 2)
    causes.push({ cause: 'Urbanisation / land-use change in the recharge area', confidence: 'Moderate', evidence: [`built-up index rose ${satellite.builtup_change_pp} pp`, satellite.interpretation], counter_evidence: [] });
  if (satellite.ndvi_change_pct != null && satellite.ndvi_change_pct < -5)
    causes.push({ cause: 'Vegetation / forest-cover loss reducing infiltration', confidence: 'Moderate', evidence: [`NDVI fell ${satellite.ndvi_change_pct}%`], counter_evidence: [] });
  if (rainfall.anomaly_pct < -12)
    causes.push({ cause: 'Rainfall deficit', confidence: 'Moderate', evidence: [rainfall.summary], counter_evidence: [] });
  if (!causes.length)
    causes.push({ cause: 'Cause not resolved from remote data', confidence: 'Low', evidence: [], counter_evidence: ['rainfall near normal', 'no strong satellite change'] });
  return {
    primary_cause: causes[0].cause,
    ranked_causes: causes,
    explanation: `Flow is ${factors.flow_anomaly_pct}% below the seasonal baseline. ${rainfall.summary} ${satellite.interpretation}`,
    implicated_zone: 'lower catchment',
    suggestions: [{ action: 'Field verification of the recharge area', why: 'confirm the remote signals on the ground before any works' }],
    uncertainty: 'A hydrogeologist should verify the recharge boundary and inspect the implicated zone.',
    __models: models,
  };
}
