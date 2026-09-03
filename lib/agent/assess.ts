import { admin } from '../db';
import { env } from '../env';
import { detectAnomaly, mean, round, seasonalBaseline, stddev, trend } from '../stats';
import { chat } from './llm';

export interface SignalResult {
  id: string;
  sensor_id: string;
  kind: string;
  severity: string;
  decision: string;
  headline: string;
  metrics: Record<string, unknown>;
}

/** Analyse one sensor's flow, write a signal row, return it (+ whether to escalate). */
export async function assessSensor(sensorId: string): Promise<{ signal: SignalResult; escalate: boolean } | null> {
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', sensorId).single();
  if (!sensor) return null;

  const { data: rows } = await admin
    .from('readings').select('flow_lpm, ts')
    .eq('sensor_id', sensorId).order('ts', { ascending: true });
  const series = (rows ?? []).map((r) => ({ ts: r.ts as string, discharge_l_min: r.flow_lpm as number }));

  const now = new Date();
  const lastTs = series.length ? new Date(series[series.length - 1].ts) : null;
  const stale = !lastTs || now.getTime() - lastTs.getTime() > 21 * 86400000;

  // --- inactive / offline: report, never escalate ---
  if (!sensor.active || stale) {
    const headline = !sensor.active
      ? `${sensor.name}: sensor inactive — no live data, spring status unknown.`
      : `${sensor.name}: no reading in 3+ weeks — treated as offline, status unknown.`;
    const signal = await writeSignal({
      sensor_id: sensorId, kind: 'inactive', severity: 'low', decision: 'watching',
      headline, agent_reasoning: 'Absence of data is not evidence the spring is fine or failing. Lower-urgency data-loss note; extend the check interval.',
      metrics: { last_reading_ts: lastTs?.toISOString() ?? null, last_flow_lpm: series.at(-1)?.discharge_l_min ?? null },
      model: null,
    });
    return { signal, escalate: false };
  }

  // --- compute indicators (pure code) ---
  const current = series[series.length - 1].discharge_l_min;
  const sb = seasonalBaseline(series, now);
  const anomaly = detectAnomaly(current, series, now);
  const recent8 = series.slice(-8).map((s) => s.discharge_l_min);
  const prev8 = series.slice(-16, -8).map((s) => s.discharge_l_min);
  const trend8pct = prev8.length ? round(((mean(recent8) - mean(prev8)) / mean(prev8)) * 100, 1) : 0;
  // year-over-year: last 12 weeks vs the same 12 weeks one year earlier (removes season)
  const nowWin = series.slice(-12).map((s) => s.discharge_l_min);
  const yearAgoWin = series.slice(-64, -52).map((s) => s.discharge_l_min);
  const yoyPct = yearAgoWin.length ? round(((mean(nowWin) - mean(yearAgoWin)) / mean(yearAgoWin)) * 100, 1) : 0;
  const longTrend = yoyPct < -6 ? 'falling' : yoyPct > 6 ? 'rising' : 'flat';
  const cv = mean(recent8) ? round((stddev(recent8) / mean(recent8)) * 100, 1) : 0;

  const metrics = {
    current_lpm: current,
    seasonal_baseline_lpm: Number.isFinite(sb.baseline) ? round(sb.baseline, 2) : null,
    anomaly_pct: anomaly.anomalyPct,
    z: anomaly.z,
    trend_8w_pct: trend8pct,
    year_on_year_pct: yoyPct,
    long_trend: longTrend,
    variability_cv_pct: cv,
  };

  // --- rule-based kind + escalation eligibility ---
  // Anomaly vs the spring's own seasonal baseline is the robust signal; the 8-week
  // trend is seasonal-noisy so it is only a secondary confirmation.
  const sustainedDecline = anomaly.anomalyPct < -10 && anomaly.z < -1.2;
  let kind: string;
  if (sustainedDecline || (anomaly.anomalyPct < -6 && trend8pct < -5)) kind = 'declining';
  else if (cv > 20) kind = 'irregular';
  else if (trend8pct > 8 && anomaly.anomalyPct > -4 && longTrend === 'rising') kind = 'recovering';
  else kind = 'stable';

  const severe = kind === 'declining' && anomaly.anomalyPct < -20;
  const eligible = kind === 'declining' && anomaly.anomalyPct < -14 && anomaly.z < -1.3;

  if (kind === 'stable') {
    const signal = await writeSignal({
      sensor_id: sensorId, kind, severity: 'low', decision: 'normal',
      headline: `${sensor.name}: flow within normal seasonal range (${anomaly.anomalyPct}% vs baseline).`,
      agent_reasoning: 'No meaningful deviation from this spring\'s own seasonal pattern. No action.',
      metrics, model: null,
    });
    return { signal, escalate: false };
  }

  // --- LLM: interpret + decide watch vs escalate ---
  const sys =
    'You are Spring Sentinel\'s monitoring agent. You receive pre-computed flow indicators for one ' +
    'spring sensor and decide how to respond. You never claim a cause here — that is a separate deep ' +
    'investigation. Output strict JSON only.';
  const user =
    `Spring: ${sensor.name}, ${sensor.village}, Darchula (${sensor.elevation_m} m). Expected ~${sensor.expected_flow_lpm} L/min.\n` +
    `Indicators (computed in code):\n${JSON.stringify(metrics, null, 1)}\n` +
    `Rule pre-check: kind=${kind}, escalation-eligible=${eligible}, severe=${severe}.\n\n` +
    'Return JSON: {"headline": one sentence for the activity feed, "reasoning": 2-3 sentences on what the numbers mean and whether normal seasonal variation or a sensor glitch could explain it, ' +
    '"decision": "watching" | "escalated" | "normal", "severity": "low" | "medium" | "high"}. ' +
    'Only choose "escalated" if escalation-eligible is true and a real, sustained decline is the best reading of the data. Otherwise "watching".';

  let parsed: any = {};
  let model = env.llmModelFast;
  try {
    const res = await chat({
      model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      maxTokens: 500, temperature: 0.2, responseFormat: 'json_object',
    });
    model = res.model;
    parsed = JSON.parse((res.message.content ?? '{}').replace(/^```json\s*|\s*```$/g, '').trim());
  } catch {
    parsed = {
      headline: `${sensor.name}: flow ${metrics.anomaly_pct}% below seasonal baseline, ${kind}.`,
      reasoning: 'Automated fallback — LLM unavailable. Indicators point to a sustained decline.',
      decision: eligible ? 'escalated' : 'watching',
      severity: severe ? 'high' : 'medium',
    };
  }

  // Code owns the escalation decision for clear-cut severe declines; the LLM's
  // judgement is used only for borderline (eligible but not severe) cases.
  let decision: string;
  if (severe) decision = 'escalated';
  else if (!eligible) decision = 'watching';
  else decision = parsed.decision === 'escalated' ? 'escalated' : 'watching';
  const severity = severe ? 'high' : (['low', 'medium', 'high'].includes(parsed.severity) ? parsed.severity : 'medium');

  const signal = await writeSignal({
    sensor_id: sensorId, kind, severity, decision,
    headline: parsed.headline || `${sensor.name}: ${kind} flow, ${metrics.anomaly_pct}% vs baseline.`,
    agent_reasoning: parsed.reasoning || null,
    metrics, model,
  });
  return { signal, escalate: decision === 'escalated' };
}

async function writeSignal(row: {
  sensor_id: string; kind: string; severity: string; decision: string;
  headline: string; agent_reasoning: string | null; metrics: Record<string, unknown>; model: string | null;
}): Promise<SignalResult> {
  const { data, error } = await admin.from('signals').insert({
    sensor_id: row.sensor_id,
    kind: row.kind,
    severity: row.severity,
    decision: row.decision,
    headline: row.headline,
    agent_reasoning: row.agent_reasoning,
    metrics: row.metrics,
    model: row.model,
  }).select('*').single();
  if (error) throw new Error(`signal insert: ${error.message}`);
  return {
    id: data.id, sensor_id: data.sensor_id, kind: data.kind,
    severity: data.severity, decision: data.decision, headline: data.headline,
    metrics: data.metrics,
  };
}
