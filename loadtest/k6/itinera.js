// itinera routing and isochrones over the graph it built from the OSM extract.
//
// Coordinates go in as "lat,lon" for /route and as separate lat/lon params for
// /isochrone, which is the service's own convention, not a typo.
//
// Random coordinate pairs are useless here: itinera snaps an off-graph point to
// the nearest node, and on a small extract two snapped nodes often land in
// different connected components, so /route answers 404 "no route found". That
// is correct behaviour, but it makes an error-rate gate flap and hides a real
// regression. So setup() discovers pairs that actually route, using addresses
// from geokode (which imported the same extract) rather than coordinates
// hardcoded for one region.

import { BASE, get, probe, scenario, summaryTo, thresholds } from './lib.js';
import { ORIGIN } from '../geo.js';

const SPECS = [
  { op: 'route', target: 'graph', p95: 3000 },
  { op: 'isochrone', target: 'graph', p95: 5000 },
];

// Enough pairs that VUs are not all replaying one shortest path, few enough that
// setup stays short.
const WANT_PAIRS = 8;
const CANDIDATES = 30;

export const options = {
  scenarios: scenario('itinera'),
  thresholds: thresholds(SPECS),
};

export function setup() {
  const res = probe(`${BASE}/api/geocode/reverse?lon=${ORIGIN[0]}&lat=${ORIGIN[1]}&limit=${CANDIDATES}`);
  if (res.status !== 200) {
    console.warn(`geokode reverse -> ${res.status}: cannot pick routable points, ops skipped`);
    return { pairs: [] };
  }
  const points = res
    .json()
    .results.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => [r.lat, r.lon]);

  const pairs = [];
  for (let i = 0; i < points.length && pairs.length < WANT_PAIRS; i++) {
    for (let j = points.length - 1; j > i && pairs.length < WANT_PAIRS; j--) {
      const [from, to] = [points[i], points[j]];
      const res2 = probe(
        `${BASE}/api/route?from=${from[0]},${from[1]}&to=${to[0]},${to[1]}&profile=car`,
      );
      if (res2.status === 200) pairs.push({ from, to });
    }
  }
  if (!pairs.length) {
    console.warn(`no routable pair among ${points.length} addresses, ops skipped`);
  } else {
    console.log(`itinera: ${pairs.length} routable pairs from ${points.length} addresses`);
  }
  return { pairs };
}

export default function (data) {
  if (!data.pairs.length) return;
  const { from, to } = data.pairs[Math.floor(Math.random() * data.pairs.length)];
  get(SPECS[0], `${BASE}/api/route?from=${from[0]},${from[1]}&to=${to[0]},${to[1]}&profile=car`);
  get(SPECS[1], `${BASE}/api/isochrone?lat=${from[0]}&lon=${from[1]}&max_seconds=300&profile=car`);
}

export const handleSummary = summaryTo(`${__ENV.LOADTEST_OUT || 'out'}/itinera.json`);
