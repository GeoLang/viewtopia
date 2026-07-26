// fenestra OGC gateway: WMS GetMap renders a PNG server-side, WFS GetFeature
// returns GeoJSON. Both resolve their layer by name against ptolemy datasets.
//
// fenestra is not behind the viewtopia proxy, so this is the one scenario that
// addresses a service port directly (LOADTEST_FENESTRA_URL, default :3003).
//
// fenestra fetches a layer by exporting the whole branch as GeoJSON from
// ptolemy and filtering in process, with no bbox pushdown. Its latency
// therefore tracks the layer's total feature count, not the requested extent,
// which is why the default layer is the smallest seeded chain and why the
// budgets here are the loosest in the harness. Point it at loadtest-wide with
// LOADTEST_FENESTRA_LAYER to measure that cliff on purpose.

import { API, DEPTHS, FENESTRA, get, probe, scenario, summaryTo, thresholds } from './lib.js';
import { CHAIN_BBOX, chainDataset } from '../geo.js';

const BBOX = CHAIN_BBOX.join(',');

const SPECS = [
  { op: 'getmap', target: 'wms', p95: 10000 },
  { op: 'getfeature', target: 'wfs', p95: 10000 },
];

export const options = {
  scenarios: scenario('fenestra'),
  thresholds: thresholds(SPECS),
};

export function setup() {
  if (__ENV.LOADTEST_FENESTRA_LAYER) return { layer: __ENV.LOADTEST_FENESTRA_LAYER };
  const res = probe(`${API}/datasets`);
  if (res.status !== 200) {
    console.warn(`GET /datasets -> ${res.status}: cannot resolve a fenestra layer, ops skipped`);
    return {};
  }
  const names = res.json().map((d) => d.name);
  const shallowest = DEPTHS.map(Number)
    .sort((a, b) => a - b)
    .map((d) => chainDataset(d))
    .find((name) => names.includes(name));
  const layer = shallowest || (names.includes('demo_parcels') ? 'demo_parcels' : null);
  if (!layer) console.warn('no seeded layer for fenestra, ops skipped');
  return { layer };
}

export default function (data) {
  if (!data.layer) return;
  get(
    SPECS[0],
    `${FENESTRA}/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${data.layer}` +
      `&STYLES=&CRS=EPSG:4326&BBOX=${BBOX}&WIDTH=512&HEIGHT=512&FORMAT=image/png`,
  );
  get(
    SPECS[1],
    `${FENESTRA}/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=${data.layer}&COUNT=100&BBOX=${BBOX}`,
  );
}

export const handleSummary = summaryTo(`${__ENV.LOADTEST_OUT || 'out'}/fenestra.json`);
