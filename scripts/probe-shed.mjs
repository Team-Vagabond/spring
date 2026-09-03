import { readFileSync } from 'node:fs';
const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const l of t.split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)/); if (m) process.env[m[1]] = m[2].trim(); }

const { demGrid } = await import('../lib/geo/dem.ts').catch(() => import('../lib/geo/dem.js'));
const { delineate } = await import('../lib/geo/springshed.ts').catch(() => import('../lib/geo/springshed.js'));
const { analyzeRainfall } = await import('../lib/geo/rainfall.ts').catch(() => import('../lib/geo/rainfall.js'));

// A spring above Khalanga, Darchula
const lat = 29.842, lng = 80.57;

console.time('dem');
const dem = await demGrid(lat, lng, 4);
console.timeEnd('dem');
console.log('dem', dem.width, 'x', dem.height, 'cellSizeM', dem.cellSizeM.toFixed(1), 'bbox', dem.bbox.map((n) => n.toFixed(3)));
console.log('elev at spring', dem.at(dem.toRow(lat), dem.toCol(lng)).toFixed(0), 'm');

console.time('shed');
const shed = await delineate(dem, lat, lng);
console.timeEnd('shed');
console.log('shed area_km2', shed.area_km2, 'cells', shed.cell_count, 'elev', shed.elev_min_m, '-', shed.elev_max_m, 'res', shed.grid_res_m, 'm');
console.log('polygon points', shed.polygon.geometry.coordinates[0].length, 'snapped', shed.spring_snapped);

console.time('rain');
const rain = await analyzeRainfall(lat, lng);
console.timeEnd('rain');
console.log('rain', rain.summary);
console.log('  normal', rain.annual_normal_mm, 'last12', rain.last12_mm, 'anom', rain.anomaly_pct + '%', 'dry', rain.dry_spell_days, 'd');
