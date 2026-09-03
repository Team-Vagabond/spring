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

  // reverse adjacency -> BFS upstream from outlet
  const inflow: number[][] = Array.from({ length: w * h }, () => []);
  for (let i = 0; i < w * h; i++) if (flowTo[i] >= 0) inflow[flowTo[i]].push(i);

  const member = new Uint8Array(w * h);
  const stack = [outlet];
  member[outlet] = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    for (const up of inflow[cur]) {
      if (!member[up]) { member[up] = 1; stack.push(up); }
    }
  }

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
  const edge_truncated = edgeHits > 3;

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
