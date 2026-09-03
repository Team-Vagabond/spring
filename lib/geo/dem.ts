import { PNG } from 'pngjs';
import type { BBox } from './sentinel';

// Free global DEM: AWS "terrarium" terrain-RGB tiles (Mapzen/Nextzen data).
const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE_SIZE = 256;

function lngToTileX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z;
}
function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
export function tileXToLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
export function tileYToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface DemGrid {
  z: number;
  data: Float32Array; // row-major, height*width, metres
  width: number;
  height: number;
  // pixel(0,0) is at tile-pixel (px0, py0); mapping is via web-mercator
  px0: number;
  py0: number;
  // geographic bbox actually covered
  bbox: BBox;
  cellSizeM: number; // approx ground size of one cell (at centre latitude)
  // convert lat/lng -> grid col/row (may be fractional / out of range)
  toCol(lng: number): number;
  toRow(lat: number): number;
  colToLng(col: number): number;
  rowToLat(row: number): number;
  at(row: number, col: number): number;
}

async function fetchTile(z: number, x: number, y: number): Promise<PNG> {
  const url = TILE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`tile ${z}/${x}/${y} -> ${r.status}`);
      return PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

/** Build a stitched elevation grid covering ~radiusKm around a point. */
export async function demGrid(lat: number, lng: number, radiusKm: number, z = 13): Promise<DemGrid> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const west = lng - dLng, east = lng + dLng, south = lat - dLat, north = lat + dLat;

  const tx0 = Math.floor(lngToTileX(west, z));
  const tx1 = Math.floor(lngToTileX(east, z));
  const ty0 = Math.floor(latToTileY(north, z)); // north = smaller y
  const ty1 = Math.floor(latToTileY(south, z));

  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  const width = cols * TILE_SIZE;
  const height = rows * TILE_SIZE;
  const data = new Float32Array(width * height);

  const jobs: Promise<void>[] = [];
  for (let ti = 0; ti < cols; ti++) {
    for (let tj = 0; tj < rows; tj++) {
      const tx = tx0 + ti, ty = ty0 + tj;
      jobs.push(
        fetchTile(z, tx, ty).then((png) => {
          for (let py = 0; py < TILE_SIZE; py++) {
            for (let px = 0; px < TILE_SIZE; px++) {
              const k = (py * TILE_SIZE + px) * 4;
              const R = png.data[k], G = png.data[k + 1], B = png.data[k + 2];
              const elev = R * 256 + G + B / 256 - 32768;
              const gx = ti * TILE_SIZE + px;
              const gy = tj * TILE_SIZE + py;
              data[gy * width + gx] = elev;
            }
          }
        }),
      );
    }
  }
  await Promise.all(jobs);

  const px0 = tx0 * TILE_SIZE;
  const py0 = ty0 * TILE_SIZE;
  const scale = 2 ** z * TILE_SIZE;

  const bbox: BBox = [
    tileXToLng(px0 / TILE_SIZE, z),
    tileYToLat((py0 + height) / TILE_SIZE, z),
    tileXToLng((px0 + width) / TILE_SIZE, z),
    tileYToLat(py0 / TILE_SIZE, z),
  ];

  // ground resolution of one pixel at centre latitude
  const cellSizeM = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) / scale;

  const toColF = (lngV: number) => (lngV + 180) / 360 * scale - px0;
  const toRowF = (latV: number) => {
    const r = (latV * Math.PI) / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * scale - py0;
  };

  return {
    z, data, width, height, px0, py0, bbox, cellSizeM,
    toCol: toColF,
    toRow: toRowF,
    colToLng: (col) => ((col + px0) / scale) * 360 - 180,
    rowToLat: (row) => {
      const n = Math.PI - (2 * Math.PI * (row + py0)) / scale;
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    },
    at(row, col) {
      const rr = Math.max(0, Math.min(height - 1, Math.round(row)));
      const cc = Math.max(0, Math.min(width - 1, Math.round(col)));
      return data[rr * width + cc];
    },
  };
}
