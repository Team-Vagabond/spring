import * as turf from '@turf/turf';
import type { DemGrid } from './dem';

export interface Springshed {
  polygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  area_km2: number;
  elev_min_m: number;
  elev_max_m: number;
  elev_spring_m: number;
  spring_snapped: { lat: number; lng: number };
  cell_count: number;
  grid_res_m: number;
  method: string;
  edge_truncated: boolean;
  // --- how much to trust this estimate (no ground truth to check against) ---
  stability: number;         // 0..1 — mean IoU of the catchment when the outlet is nudged ±1 cell
  snap_distance_m: number;    // how far the given point moved to reach a modelled drainage line
  on_channel: boolean;        // did it land on a channel (vs. just the lowest nearby cell)
  confidence: 'high' | 'moderate' | 'low';
  confidence_reasons: string[];
}

interface Small {
  w: number;
  h: number;
  z: number[]; // elevation, row-major
  lat: (r: number) => number;
  lng: (c: number) => number;
  resM: number;
}

function downsample(dem: DemGrid, maxDim = 200): Small {
  const factor = Math.max(1, Math.ceil(Math.max(dem.width, dem.height) / maxDim));
  const w = Math.floor(dem.width / factor);
  const h = Math.floor(dem.height / factor);
  const z = new Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      // average the factor×factor block
      let s = 0, n = 0;
      for (let dr = 0; dr < factor; dr++) {
        for (let dc = 0; dc < factor; dc++) {
          s += dem.data[(r * factor + dr) * dem.width + (c * factor + dc)];
          n++;
        }
      }
      z[r * w + c] = s / n;
    }
  }
  return {
    w, h, z,
    resM: dem.cellSizeM * factor,
    lat: (r) => dem.rowToLat((r + 0.5) * factor),
    lng: (c) => dem.colToLng((c + 0.5) * factor),
  };
}

const NB = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], /*    */ [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Very small epsilon pit-filling so flow can escape local depressions. */
function fillPits(s: Small, passes = 12) {
  const { w, h, z } = s;
  for (let p = 0; p < passes; p++) {
    let changed = false;
    for (let r = 1; r < h - 1; r++) {
      for (let c = 1; c < w - 1; c++) {
        const i = r * w + c;
        let lowest = Infinity;
        for (const [dr, dc] of NB) lowest = Math.min(lowest, z[(r + dr) * w + (c + dc)]);
        if (z[i] <= lowest) {
          z[i] = lowest + 0.01;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

export function delineate(dem: DemGrid, springLat: number, springLng: number): Springshed {
  const s = downsample(dem);
  fillPits(s);
  const { w, h, z } = s;

  const r0 = Math.round(springToRow(dem, s, springLat));
  const c0 = Math.round(springToCol(dem, s, springLng));

  // D8 flow target for each cell
  const flowTo = new Int32Array(w * h).fill(-1);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      let bestDrop = 0, bestIdx = -1;
      for (const [dr, dc] of NB) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
        const j = rr * w + cc;
        const dist = dr && dc ? Math.SQRT2 : 1;
        const drop = (z[i] - z[j]) / dist;
        if (drop > bestDrop) { bestDrop = drop; bestIdx = j; }
      }
      flowTo[i] = bestIdx;
    }
  }

  // flow accumulation (process cells high -> low so upstream is done first)
  const order = [...Array(w * h).keys()].sort((a, b) => z[b] - z[a]);
  const acc = new Float64Array(w * h).fill(1);
  for (const i of order) if (flowTo[i] >= 0) acc[flowTo[i]] += acc[i];
  const streamThresh = Math.max(15, (w * h) * 0.004); // cells

  // snap spring: nearest stream cell within a window, else lowest cell
  let sr = Math.max(1, Math.min(h - 2, r0));
  let sc = Math.max(1, Math.min(w - 2, c0));
  {
    let bestScore = -Infinity;
    let found = false;
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const rr = sr + dr, cc = sc + dc;
        if (rr < 1 || cc < 1 || rr >= h - 1 || cc >= w - 1) continue;
        const j = rr * w + cc;
        if (acc[j] < streamThresh) continue;
        const score = acc[j] - (dr * dr + dc * dc) * 50; // prefer strong + near
        if (score > bestScore) { bestScore = score; sr = rr; sc = cc; found = true; }
      }
    }
    if (!found) {
      let best = z[sr * w + sc];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = sr + dr, cc = sc + dc;
        if (rr < 1 || cc < 1 || rr >= h - 1 || cc >= w - 1) continue;
        if (z[rr * w + cc] < best) { best = z[rr * w + cc]; sr = rr; sc = cc; }
      }
    }
  }
  const outlet = sr * w + sc;
  const onChannel = acc[outlet] >= streamThresh;

  // reverse adjacency -> BFS upstream from any outlet cell
  const inflow: number[][] = Array.from({ length: w * h }, () => []);
  for (let i = 0; i < w * h; i++) if (flowTo[i] >= 0) inflow[flowTo[i]].push(i);

  const upslopeOf = (out: number): Uint8Array => {
    const m = new Uint8Array(w * h);
    const stk = [out];
    m[out] = 1;
    while (stk.length) {
      const cur = stk.pop()!;
      for (const up of inflow[cur]) if (!m[up]) { m[up] = 1; stk.push(up); }
    }
    return m;
  };

  const member = upslopeOf(outlet);

  // --- stability: nudge the outlet ±1 cell in all 8 directions, re-trace, compare (IoU on masks) ---
  let iouSum = 0, iouN = 0;
  const baseCount0 = member.reduce((a, b) => a + b, 0);
  for (const [dr, dc] of NB) {
    const rr = sr + dr, cc = sc + dc;
    if (rr < 1 || cc < 1 || rr >= h - 1 || cc >= w - 1) continue;
    const m2 = upslopeOf(rr * w + cc);
    let inter = 0, uni = 0;
    for (let i = 0; i < w * h; i++) {
      const a = member[i], b = m2[i];
      if (a || b) uni++;
      if (a && b) inter++;
    }
    if (uni > 0) { iouSum += inter / uni; iouN++; }
  }
  const stability = iouN ? iouSum / iouN : 0;

  // stats
  let count = 0, emin = Infinity, emax = -Infinity, edgeHits = 0;
  for (let i = 0; i < w * h; i++) {
    if (!member[i]) continue;
    count++;
    const e = z[i];
    if (e < emin) emin = e;
    if (e > emax) emax = e;
    const r = Math.floor(i / w), c = i % w;
    if (r === 0 || c === 0 || r === h - 1 || c === w - 1) edgeHits++;
  }
  void baseCount0;
  const edge_truncated = edgeHits > 3;

  const snapCells = Math.hypot(sr - Math.max(1, Math.min(h - 2, r0)), sc - Math.max(1, Math.min(w - 2, c0)));
  const snap_distance_m = Math.round(snapCells * s.resM);

  const reasons: string[] = [];
  if (stability >= 0.8) reasons.push(`Stable: nudging the spring point by one cell in every direction re-traces to catchments that overlap ${Math.round(stability * 100)}% on average.`);
  else if (stability >= 0.55) reasons.push(`Moderately stable: a one-cell shift in the spring point changes the catchment somewhat (${Math.round(stability * 100)}% overlap).`);
  else reasons.push(`Unstable: a one-cell shift in the spring point produces a substantially different catchment (${Math.round(stability * 100)}% overlap) — the outline is sensitive to the exact location.`);
  if (onChannel && snap_distance_m <= s.resM * 2) reasons.push(`The spring point sat on or within ${snap_distance_m} m of a modelled drainage line (good).`);
  else if (onChannel) reasons.push(`The spring point was ${snap_distance_m} m from the nearest modelled drainage line and was snapped to it.`);
  else reasons.push(`No clear drainage line near the spring point — the outlet was placed at the lowest nearby cell, which is less reliable.`);
  if (edge_truncated) reasons.push(`The catchment reaches the edge of the analysis area, so its true extent is larger than shown.`);
  else reasons.push(`The catchment closes within the analysis area (good).`);

  let confidence: Springshed['confidence'];
  if (stability >= 0.78 && onChannel && !edge_truncated && snap_distance_m <= s.resM * 3) confidence = 'high';
  else if (stability >= 0.5 && onChannel) confidence = 'moderate';
  else confidence = 'low';

  // build outline polygon from member mask (boundary edge chaining)
  const poly = maskToPolygon(member, w, h, s);
  const simplified = turf.simplify(poly, { tolerance: 0.0004, highQuality: false, mutate: false }) as typeof poly;
  const area_km2 = turf.area(simplified) / 1e6;

  return {
    polygon: simplified,
    area_km2: Math.round(area_km2 * 100) / 100,
    elev_min_m: Math.round(emin),
    elev_max_m: Math.round(emax),
    elev_spring_m: Math.round(z[outlet]),
    spring_snapped: { lat: s.lat(sr), lng: s.lng(sc) },
    cell_count: count,
    grid_res_m: Math.round(s.resM),
    edge_truncated,
    stability: Math.round(stability * 100) / 100,
    snap_distance_m,
    on_channel: onChannel,
    confidence,
    confidence_reasons: reasons,
    method:
      'Topographic (D8) upslope contributing area from an SRTM-derived DEM, snapped to the nearest drainage line. ' +
      'This is a first-order estimate of the surface catchment — the true recharge area follows subsurface geology and may differ.' +
      (edge_truncated ? ' The catchment reaches the analysis boundary, so the true area is likely larger.' : ''),
  };
}

function springToCol(dem: DemGrid, s: Small, lng: number): number {
  const full = dem.toCol(lng);
  return (full / dem.width) * s.w;
}
function springToRow(dem: DemGrid, s: Small, lat: number): number {
  const full = dem.toRow(lat);
  return (full / dem.height) * s.h;
}

/** Trace the outline of a binary mask into a GeoJSON polygon (grid-edge chaining). */
function maskToPolygon(
  member: Uint8Array,
  w: number,
  h: number,
  s: Small,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  // corner coordinate of cell edges: corner (r,c) sits at the NW corner of cell (r,c)
  const cornerLat = (r: number) => {
    // linear extrapolation from cell centres
    const a = s.lat(0), b = s.lat(1);
    return a + (b - a) * (r - 0.5);
  };
  const cornerLng = (c: number) => {
    const a = s.lng(0), b = s.lng(1);
    return a + (b - a) * (c - 0.5);
  };

  const isM = (r: number, c: number) => (r < 0 || c < 0 || r >= h || c >= w ? 0 : member[r * w + c]);

  // collect boundary edges as directed segments so the interior is on the left
  const edges = new Map<string, [number, number]>(); // "r,c" corner -> next "r,c"
  const key = (r: number, c: number) => `${r},${c}`;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!member[r * w + c]) continue;
      // top edge (member above? no -> boundary)  corner (r,c)->(r,c+1)
      if (!isM(r - 1, c)) edges.set(key(r, c), [r, c + 1]);
      // right edge  (r,c+1)->(r+1,c+1)
      if (!isM(r, c + 1)) edges.set(key(r, c + 1), [r + 1, c + 1]);
      // bottom edge (r+1,c+1)->(r+1,c)
      if (!isM(r + 1, c)) edges.set(key(r + 1, c + 1), [r + 1, c]);
      // left edge  (r+1,c)->(r,c)
      if (!isM(r, c - 1)) edges.set(key(r + 1, c), [r, c]);
    }
  }

  const rings: number[][][] = []; // each ring is Position[]
  const used = new Set<string>();
  for (const start of edges.keys()) {
    if (used.has(start)) continue;
    const ring: number[][] = [];
    let cur = start;
    let guard = 0;
    while (edges.has(cur) && !used.has(cur) && guard++ < 100000) {
      used.add(cur);
      const [r, c] = cur.split(',').map(Number);
      ring.push([cornerLng(c), cornerLat(r)]);
      const nxt = edges.get(cur)!;
      cur = key(nxt[0], nxt[1]);
    }
    if (ring.length >= 4) {
      ring.push(ring[0]);
      rings.push(ring);
    }
  }

  if (rings.length === 0) {
    return turf.bboxPolygon([s.lng(0), s.lat(h - 1), s.lng(w - 1), s.lat(0)]);
  }
  let best = rings[0];
  let bestA = Math.abs(turf.area(turf.polygon([rings[0]])));
  for (const rg of rings.slice(1)) {
    const a = Math.abs(turf.area(turf.polygon([rg])));
    if (a > bestA) { bestA = a; best = rg; }
  }
  return turf.polygon([best]);
}
