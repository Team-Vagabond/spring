import { env } from '../env';

// --- OAuth token (cached in module scope) ---
let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) return cached.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.shClientId,
    client_secret: env.shClientSecret,
  });
  const r = await fetch(env.shTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Sentinel Hub auth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 600) * 1000 };
  return cached.token;
}

export type BBox = [number, number, number, number]; // west, south, east, north

/** A square bbox in degrees around a point (km radius, rough). */
export function bboxAround(lat: number, lng: number, km: number): BBox {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

const TRUE_COLOR_EVAL = `//VERSION=3
function setup(){return {input:["B02","B03","B04","dataMask"],output:{bands:4}};}
function stretch(v){ return Math.max(0, Math.min(1, Math.pow(3.8*v, 0.85))); }
function evaluatePixel(s){
  return [stretch(s.B04), stretch(s.B03), stretch(s.B02), s.dataMask];
}`;

/** Least-cloud true-colour PNG for a period. Returns raw PNG bytes. */
export async function trueColorPng(
  bbox: BBox,
  from: string,
  to: string,
  size = 640,
): Promise<Buffer> {
  const tok = await token();
  const req = {
    input: {
      bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
          mosaickingOrder: 'leastCC',
          maxCloudCoverage: 25,
        },
      }],
    },
    output: { width: size, height: size, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
    evalscript: TRUE_COLOR_EVAL,
  };
  const r = await fetch(`${env.shApiUrl}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, Accept: 'image/png' },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`Sentinel Hub process ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

const INDEX_EVAL = `//VERSION=3
function setup(){return {input:[{bands:["B04","B08","B11","SCL","dataMask"]}],output:[{id:"default",bands:2},{id:"dataMask",bands:1}]};}
function evaluatePixel(s){
  let ndvi=(s.B08-s.B04)/(s.B08+s.B04+1e-6);
  let ndbi=(s.B11-s.B08)/(s.B11+s.B08+1e-6);
  let bad = (s.SCL==0||s.SCL==1||s.SCL==3||s.SCL==8||s.SCL==9||s.SCL==10||s.SCL==11);
  return {default:[ndvi, ndbi], dataMask:[bad ? 0 : s.dataMask]};
}`;

export interface IndexStats {
  ndvi: number | null;
  ndbi: number | null;
  sampleCount: number;
  period: string;
}

/** Mean NDVI + NDBI over the bbox for a period (Statistics API). */
export async function indexStats(bbox: BBox, from: string, to: string): Promise<IndexStats> {
  const tok = await token();
  const req = {
    input: {
      bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC', maxCloudCoverage: 50 } }],
    },
    aggregation: {
      timeRange: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
      aggregationInterval: { of: 'P100D' },
      evalscript: INDEX_EVAL,
      resx: 0.00025,
      resy: 0.00025,
    },
    calculations: { default: {} },
  };
  const r = await fetch(`${env.shApiUrl}/statistics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`Sentinel Hub statistics ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  // pick the interval with the most valid samples
  let best: any = null;
  for (const d of j.data ?? []) {
    const b = d.outputs?.default?.bands;
    const n = b?.B0?.stats?.sampleCount ?? 0;
    const noData = b?.B0?.stats?.noDataCount ?? 0;
    const valid = n - noData;
    if (!best || valid > best.valid) best = { valid, b, interval: d.interval };
  }
  if (!best || best.valid <= 0) return { ndvi: null, ndbi: null, sampleCount: 0, period: `${from}..${to}` };
  return {
    ndvi: best.b.B0.stats.mean,
    ndbi: best.b.B1.stats.mean,
    sampleCount: best.valid,
    period: `${best.interval.from.slice(0, 10)}..${best.interval.to.slice(0, 10)}`,
  };
}

export interface SatelliteComparison {
  bbox: BBox;
  past_period: string;
  recent_period: string;
  ndvi_past: number | null;
  ndvi_recent: number | null;
  ndvi_change_pct: number | null;
  ndbi_past: number | null;
  ndbi_recent: number | null;
  builtup_change_pp: number | null;
  valid_coverage: 'good' | 'partial' | 'poor';
  interpretation: string;
}

function round(x: number | null, d = 3): number | null {
  return x == null ? null : Math.round(x * 10 ** d) / 10 ** d;
}

/** Compare vegetation + built-up between a historical and a recent dry season. */
export async function compareEras(
  bbox: BBox,
  pastFrom: string,
  pastTo: string,
  recentFrom: string,
  recentTo: string,
): Promise<SatelliteComparison> {
  const [past, recent] = await Promise.all([
    indexStats(bbox, pastFrom, pastTo),
    indexStats(bbox, recentFrom, recentTo),
  ]);

  const ndviChange =
    past.ndvi != null && recent.ndvi != null && past.ndvi !== 0
      ? ((recent.ndvi - past.ndvi) / Math.abs(past.ndvi)) * 100
      : null;
  const ndbiChange =
    past.ndbi != null && recent.ndbi != null ? (recent.ndbi - past.ndbi) * 100 : null; // in "index points" *100 ~ pp

  const minSamples = Math.min(past.sampleCount, recent.sampleCount);
  const coverage = minSamples > 20000 ? 'good' : minSamples > 3000 ? 'partial' : 'poor';

  const bits: string[] = [];
  if (ndviChange != null) {
    if (ndviChange < -8) bits.push(`vegetation cover fell markedly (NDVI ${ndviChange.toFixed(0)}%)`);
    else if (ndviChange < -3) bits.push(`slight vegetation decline (NDVI ${ndviChange.toFixed(0)}%)`);
    else if (ndviChange > 5) bits.push(`vegetation actually increased (NDVI +${ndviChange.toFixed(0)}%)`);
    else bits.push('vegetation roughly stable');
  }
  if (ndbiChange != null) {
    if (ndbiChange > 4) bits.push('a clear rise in built-up / bare surface (urbanisation or road works)');
    else if (ndbiChange > 1.5) bits.push('a modest rise in built-up / bare surface');
    else bits.push('no meaningful built-up increase');
  }
  const interpretation =
    (coverage === 'poor' ? 'Cloud/snow limited the usable imagery, so read this cautiously. ' : '') +
    `Between ${past.period} and ${recent.period}, the recharge area shows ${bits.join('; ')}.`;

  return {
    bbox,
    past_period: past.period,
    recent_period: recent.period,
    ndvi_past: round(past.ndvi),
    ndvi_recent: round(recent.ndvi),
    ndvi_change_pct: round(ndviChange, 1),
    ndbi_past: round(past.ndbi),
    ndbi_recent: round(recent.ndbi),
    builtup_change_pp: round(ndbiChange, 1),
    valid_coverage: coverage,
    interpretation,
  };
}
