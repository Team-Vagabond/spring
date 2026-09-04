// Synthetic SENSOR + FLOW data only. Everything geospatial (satellite, DEM, rainfall)
// is real and live. Flow history uses a seasonal model + a per-sensor scenario,
// not random noise, and is clearly disclosed in the UI.

export type Scenario = 'stable' | 'declining' | 'irregular' | 'recovering';

export interface SensorSeed {
  id: string;
  name: string;
  village: string;
  lat: number;
  lng: number;
  elevation_m: number;
  expected_flow_lpm: number;
  scenario: Scenario;
  active: boolean;
  installed_on: string;
}

// Springs in Darchula district, Sudurpashchim, Nepal (west of the Mahakali).
export const SENSOR_SEEDS: SensorSeed[] = [
  { id: 'DRC-01', name: 'Khalanga Mul Dhara', village: 'Khalanga (Darchula HQ)', lat: 29.8420, lng: 80.5710, elevation_m: 1290, expected_flow_lpm: 6.5, scenario: 'declining', active: true, installed_on: '2023-04-12' },
  { id: 'DRC-02', name: 'Gokuleshwar Pandhero', village: 'Gokuleshwar', lat: 29.6842, lng: 80.6060, elevation_m: 1180, expected_flow_lpm: 5.2, scenario: 'stable', active: true, installed_on: '2023-05-03' },
  { id: 'DRC-03', name: 'Marma Naula', village: 'Marma', lat: 29.7245, lng: 80.5360, elevation_m: 1720, expected_flow_lpm: 7.0, scenario: 'declining', active: true, installed_on: '2023-06-20' },
  { id: 'DRC-04', name: 'Latinath Dhara', village: 'Latinath', lat: 29.7585, lng: 80.6120, elevation_m: 1610, expected_flow_lpm: 4.4, scenario: 'irregular', active: true, installed_on: '2024-02-11' },
  { id: 'DRC-05', name: 'Dattu Kuwa', village: 'Dattu', lat: 29.8030, lng: 80.5210, elevation_m: 1975, expected_flow_lpm: 8.1, scenario: 'recovering', active: true, installed_on: '2023-03-28' },
  { id: 'DRC-06', name: 'Sitola Mul', village: 'Sitola', lat: 29.6660, lng: 80.5560, elevation_m: 1425, expected_flow_lpm: 5.8, scenario: 'stable', active: false, installed_on: '2024-01-09' },
  // DRC-07: real recharge area shows NDVI -12% (vegetation cover fell markedly) with
  // no built-up rise and near-normal annual rainfall — a genuine land-cover-driven decline.
  { id: 'DRC-07', name: 'Ghusa Mul Dhara', village: 'Ghusa (upper Dattu)', lat: 29.8200, lng: 80.5400, elevation_m: 1180, expected_flow_lpm: 5.6, scenario: 'declining', active: true, installed_on: '2023-07-15' },
];

// Real-world local context a municipal water desk would already hold — community
// reports, ward observations. Given to the agent as a lead to VERIFY, never as a
// verdict; it still weighs this against the live satellite / rainfall evidence.
export const FIELD_NOTES: Record<string, string> = {
  'DRC-07':
    'Ward office community report (last two years): households on the upper slope above this spring cleared a stand of forest and broke new terraced farmland there. No new houses, roads, or construction have been reported anywhere in the catchment.',
};

export function generateFlowHistory(seed: SensorSeed, weeks = 130): { ts: string; flow_lpm: number }[] {
  const rnd = mulberry32(hashSeed(seed.id));
  const out: { ts: string; flow_lpm: number }[] = [];
  const now = Date.now();
  const base = seed.expected_flow_lpm;

  for (let w = weeks; w >= 0; w--) {
    const t = new Date(now - w * 7 * 86400000);
    const doy = Math.floor((t.getTime() - Date.UTC(t.getFullYear(), 0, 0)) / 86400000);
    // Nepal hills: post-monsoon peak ~Sept (doy 250), pre-monsoon trough ~May (doy 130)
    const seasonal = Math.sin(((doy - 130) / 365) * 2 * Math.PI) * 0.20 * base;
    const noise = (rnd() - 0.5) * 0.05 * base;
    let v = base + seasonal + noise;
    const yearsAgo = w / 52;

    if (seed.scenario === 'declining') {
      if (yearsAgo < 2) v -= (2 - yearsAgo) / 2 * 0.30 * base;      // steady multi-year decline
      if (w < 40) v -= (40 - w) / 40 * 0.12 * base;                 // steeper recently
    } else if (seed.scenario === 'irregular') {
      v += Math.sin(w * 1.9) * 0.18 * base * (w < 30 ? 1.6 : 1);    // spiky, worse lately
      if (w < 20) v -= (20 - w) / 20 * 0.10 * base;
    } else if (seed.scenario === 'recovering') {
      if (w > 26) v -= Math.min((w - 26) / 45, 1) * 0.24 * base;    // declined, then...
      else v += (26 - w) / 26 * 0.10 * base;                        // ...recovering
    }
    out.push({ ts: t.toISOString(), flow_lpm: Math.max(0.2, Number(v.toFixed(2))) });
  }
  return out;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
