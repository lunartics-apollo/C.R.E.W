// Builds compact coastline data for the game from Natural Earth (public domain) via world-atlas.
// Output: src/data/geo/world.json (coarse land, 110m) and src/data/geo/borneo.json (50m, SE Asia region).
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const load = (p) => JSON.parse(readFileSync(new URL(`../node_modules/world-atlas/${p}`, import.meta.url)));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function rings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

// World land (110m) - for the global ground-track view.
const land110 = feature(load('land-110m.json'), load('land-110m.json').objects.land);
const worldRings = land110.features.flatMap((f) => rings(f.geometry))
  .map((r) => r.map(([x, y]) => [round(x, 1), round(y, 1)]))
  .filter((r) => r.length > 3);
writeFileSync(new URL('../src/data/geo/world.json', import.meta.url), JSON.stringify({ source: 'Natural Earth 1:110m land via world-atlas@2 (public domain)', rings: worldRings }));

// Countries (50m) clipped to a SE Asia bounding box for the regional view.
const c50 = load('countries-50m.json');
const countries = feature(c50, c50.objects.countries);
const box = { minLon: 94, maxLon: 128, minLat: -10, maxLat: 14 };
const wanted = new Map([['458', 'MY'], ['096', 'BN'], ['360', 'ID'], ['608', 'PH'], ['764', 'TH'], ['704', 'VN'], ['116', 'KH'], ['702', 'SG'], ['626', 'TL'], ['104', 'MM'], ['418', 'LA']]);
const region = [];
for (const f of countries.features) {
  const code = wanted.get(String(f.id).padStart(3, '0'));
  if (!code) continue;
  for (const r of rings(f.geometry)) {
    const inBox = r.some(([x, y]) => x >= box.minLon && x <= box.maxLon && y >= box.minLat && y <= box.maxLat);
    if (!inBox || r.length < 4) continue;
    region.push({ c: code, p: r.map(([x, y]) => [round(x, 2), round(y, 2)]) });
  }
}
writeFileSync(new URL('../src/data/geo/region.json', import.meta.url), JSON.stringify({ source: 'Natural Earth 1:50m admin-0 countries via world-atlas@2 (public domain)', box, shapes: region }));
console.log('world rings', worldRings.length, 'region shapes', region.length);
