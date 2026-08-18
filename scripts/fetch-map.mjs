import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(root, 'public/data/raw');
const outputDir = path.join(root, 'public/data/processed');
const query = await readFile(path.join(root, 'scripts/overpass-query.txt'), 'utf8');

await mkdir(rawDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

let raw;
let lastError;
for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'accept': 'application/json',
        'user-agent': 'realmap-disaster-sim/0.1 (local educational prototype)',
      },
      body: new URLSearchParams({ data: query }),
    });
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
    raw = await response.json();
    break;
  } catch (error) {
    lastError = error;
    console.warn(`Map download failed, trying next endpoint: ${String(error)}`);
  }
}

if (!raw) throw lastError ?? new Error('No Overpass API endpoint was available.');
await writeFile(path.join(rawDir, 'kodaira-city-hall.osm.json'), JSON.stringify(raw, null, 2));

const bbox = { south: 35.7259, west: 139.4742, north: 35.7313, east: 139.4808 };
const center = { lat: 35.7286, lon: 139.4775 };
const metersPerLat = 111_132;
const metersPerLon = 111_320 * Math.cos((center.lat * Math.PI) / 180);
const width = (bbox.east - bbox.west) * metersPerLon;
const height = (bbox.north - bbox.south) * metersPerLat;

const project = ({ lat, lon }) => ({
  x: (lon - bbox.west) * metersPerLon,
  y: (bbox.north - lat) * metersPerLat,
});

const centroid = (points) => {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
};

const roadWidth = (kind) => ({
  primary: 12, secondary: 10, tertiary: 8, residential: 6,
  service: 4, living_street: 4, footway: 2.4, path: 2, pedestrian: 4,
  steps: 2, cycleway: 2.5,
}[kind] ?? 5);

const polygons = [];
const roads = [];
const facilities = [];
const labels = [];

for (const element of raw.elements ?? []) {
  const tags = element.tags ?? {};
  const points = element.geometry?.map(project).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ?? [];
  const nodePoint = element.type === 'node' && Number.isFinite(element.lat) ? project(element) : undefined;
  const name = tags['name:ja'] ?? tags.name;

  if (tags.highway && points.length > 1) {
    roads.push({ id: `way/${element.id}`, kind: tags.highway, name, width: roadWidth(tags.highway), points });
    if (name && points.length > 2) labels.push({ name, ...points[Math.floor(points.length / 2)], type: 'road' });
    continue;
  }

  let polygonType;
  if (tags.building) polygonType = 'building';
  else if (tags.natural === 'water' || tags.waterway) polygonType = 'water';
  else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse === 'grass') polygonType = 'park';
  else if (tags.railway) polygonType = 'railway';
  else if (tags.barrier) polygonType = 'barrier';
  else if (tags.landuse) polygonType = 'landuse';

  if (polygonType && points.length > 2) {
    polygons.push({ id: `way/${element.id}`, type: polygonType, kind: tags.building ?? tags.landuse ?? tags.leisure ?? tags.natural ?? tags.railway ?? tags.barrier, name, points });
    if (name) labels.push({ name, ...centroid(points), type: polygonType });
  }

  if (tags.amenity || tags.emergency) {
    const point = nodePoint ?? (points.length ? centroid(points) : undefined);
    if (point) facilities.push({
      id: `${element.type}/${element.id}`,
      name: name ?? tags.amenity ?? tags.emergency,
      kind: tags.amenity ?? tags.emergency,
      ...point,
    });
  }
}

const cityHall = facilities.find((item) => /小平市役所/.test(item.name)) ?? {
  id: 'official-city-hall-location', name: '小平市役所', kind: 'townhall', ...project(center),
};

const world = {
  metadata: {
    title: '小平市役所周辺',
    source: '© OpenStreetMap contributors',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    fetchedAt: new Date().toISOString(),
    bbox,
    center,
    units: 'meters',
  },
  width,
  height,
  start: { x: cityHall.x, y: cityHall.y, label: '小平市役所' },
  roads,
  polygons,
  facilities,
  labels,
};

await writeFile(path.join(outputDir, 'world.json'), JSON.stringify(world));
console.log(`Saved ${roads.length} roads, ${polygons.length} polygons, ${facilities.length} facilities.`);
