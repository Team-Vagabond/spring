export interface RainfallAnalysis {
  source: string;
  lat: number;
  lng: number;
  annual_normal_mm: number;      // mean annual total over the baseline years
  last12_mm: number;             // total for the trailing 12 months
  anomaly_pct: number;           // last12 vs normal
  monsoon_normal_mm: number;     // Jun–Sep mean
  monsoon_last_mm: number;       // most recent Jun–Sep
  monsoon_anomaly_pct: number;
  dry_spell_days: number;        // longest run of <1mm days in the trailing year
  yearly: { year: number; mm: number }[];
  summary: string;
}

const BASE_FROM = '2001-01-01';

export async function analyzeRainfall(lat: number, lng: number): Promise<RainfallAnalysis> {
  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&start_date=${BASE_FROM}&end_date=${endStr}&daily=precipitation_sum&timezone=auto`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = await r.json();
  const times: string[] = j.daily?.time ?? [];
  const precip: (number | null)[] = j.daily?.precipitation_sum ?? [];
  if (!times.length) throw new Error('Open-Meteo returned no data');

  // yearly totals
  const byYear = new Map<number, number>();
  const byYearMonsoon = new Map<number, number>();
  for (let i = 0; i < times.length; i++) {
    const d = times[i];
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    const v = precip[i] ?? 0;
    byYear.set(y, (byYear.get(y) ?? 0) + v);
    if (m >= 6 && m <= 9) byYearMonsoon.set(y, (byYearMonsoon.get(y) ?? 0) + v);
  }

  const thisYear = end.getFullYear();
  const completeYears = [...byYear.entries()].filter(([y]) => y < thisYear).map(([, mm]) => mm);
  const annual_normal_mm = completeYears.reduce((a, b) => a + b, 0) / Math.max(1, completeYears.length);

  // trailing 12 months
  const cutoff = new Date(end.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  let last12 = 0;
  let dryRun = 0, dryMax = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] < cutoff) continue;
    const v = precip[i] ?? 0;
    last12 += v;
    if (v < 1) { dryRun++; dryMax = Math.max(dryMax, dryRun); } else dryRun = 0;
  }

  const monsoonYears = [...byYearMonsoon.entries()].filter(([y]) => y < thisYear).map(([, mm]) => mm);
  const monsoon_normal_mm = monsoonYears.reduce((a, b) => a + b, 0) / Math.max(1, monsoonYears.length);
  const lastMonsoonYear = Math.max(...[...byYearMonsoon.keys()]);
  const monsoon_last_mm = byYearMonsoon.get(lastMonsoonYear) ?? 0;

  const anomaly_pct = ((last12 - annual_normal_mm) / annual_normal_mm) * 100;
  const monsoon_anomaly_pct = ((monsoon_last_mm - monsoon_normal_mm) / monsoon_normal_mm) * 100;

  const yearly = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, mm]) => ({ year, mm: Math.round(mm) }));

  let summary: string;
  if (anomaly_pct < -12)
    summary = `Trailing-12-month rainfall is ${Math.round(last12)} mm, ${Math.abs(anomaly_pct).toFixed(0)}% below the 2001–${thisYear - 1} normal of ${Math.round(annual_normal_mm)} mm — a genuine rainfall deficit.` +
      (dryMax > 90 ? ` The longest dry spell ran ${dryMax} days.` : '');
  else if (anomaly_pct < -5)
    summary = `Rainfall is mildly below normal (${anomaly_pct.toFixed(0)}%). It may contribute but is unlikely to explain a large discharge drop on its own.`;
  else if (anomaly_pct > 10)
    summary = `Rainfall is above normal (+${anomaly_pct.toFixed(0)}%) — a rainfall deficit does not explain the decline.`;
  else
    summary = `Rainfall is close to normal (${anomaly_pct.toFixed(0)}%). Climate variability is an unlikely primary cause.`;

  return {
    source: 'Open-Meteo reanalysis (ERA5-Land), daily precipitation',
    lat, lng,
    annual_normal_mm: Math.round(annual_normal_mm),
    last12_mm: Math.round(last12),
    anomaly_pct: Math.round(anomaly_pct * 10) / 10,
    monsoon_normal_mm: Math.round(monsoon_normal_mm),
    monsoon_last_mm: Math.round(monsoon_last_mm),
    monsoon_anomaly_pct: Math.round(monsoon_anomaly_pct * 10) / 10,
    dry_spell_days: dryMax,
    yearly,
    summary,
  };
}
