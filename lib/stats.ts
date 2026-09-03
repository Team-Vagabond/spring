// Pure arithmetic. The LLM is never asked to do any of this.

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function movingAverage(xs: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const slice = xs.slice(Math.max(0, i - window + 1), i + 1);
    out.push(mean(slice));
  }
  return out;
}

/**
 * Seasonal baseline: mean of readings taken within +/- `dayWindow` days of the
 * same day-of-year, across previous years of history.
 */
export function seasonalBaseline(
  history: { ts: string; discharge_l_min: number }[],
  targetDate: Date,
  dayWindow = 21,
): { baseline: number; n: number; values: number[] } {
  const targetDoy = dayOfYear(targetDate);
  const values: number[] = [];
  for (const r of history) {
    const d = new Date(r.ts);
    let diff = Math.abs(dayOfYear(d) - targetDoy);
    diff = Math.min(diff, 365 - diff);
    if (diff <= dayWindow) values.push(r.discharge_l_min);
  }
  return { baseline: values.length ? mean(values) : NaN, n: values.length, values };
}

export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export function pctChange(current: number, baseline: number): number {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

export function zScore(current: number, xs: number[]): number {
  const s = stddev(xs);
  if (!s) return 0;
  return (current - mean(xs)) / s;
}

export interface AnomalyResult {
  current: number;
  baseline: number;
  anomalyPct: number;
  z: number;
  isAnomaly: boolean;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  note: string;
}

export function detectAnomaly(
  current: number,
  history: { ts: string; discharge_l_min: number }[],
  now: Date,
): AnomalyResult {
  const { baseline, values } = seasonalBaseline(history, now);
  const base = Number.isFinite(baseline)
    ? baseline
    : mean(history.slice(-8).map((h) => h.discharge_l_min));
  const anomalyPct = pctChange(current, base);
  const z = zScore(current, values.length >= 4 ? values : history.slice(-12).map((h) => h.discharge_l_min));
  const absPct = Math.abs(anomalyPct);
  let severity: AnomalyResult['severity'] = 'none';
  if (anomalyPct < -12 && z < -1.5) severity = 'severe';
  else if (anomalyPct < -8) severity = 'moderate';
  else if (anomalyPct < -5) severity = 'mild';
  const isAnomaly = severity !== 'none';
  return {
    current,
    baseline: round(base, 2),
    anomalyPct: round(anomalyPct, 1),
    z: round(z, 2),
    isAnomaly,
    severity,
    note: isAnomaly
      ? `Discharge ${round(anomalyPct, 1)}% vs seasonal baseline ${round(base, 2)} L/min (z=${round(z, 2)}).`
      : `Discharge within normal seasonal range (${round(anomalyPct, 1)}% vs baseline).`,
  };
}

export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export function trend(xs: number[]): 'rising' | 'falling' | 'flat' {
  if (xs.length < 3) return 'flat';
  const first = mean(xs.slice(0, Math.ceil(xs.length / 3)));
  const last = mean(xs.slice(-Math.ceil(xs.length / 3)));
  const d = pctChange(last, first);
  if (d > 4) return 'rising';
  if (d < -4) return 'falling';
  return 'flat';
}
