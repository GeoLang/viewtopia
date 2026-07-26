// geokode forward and reverse geocoding, against the addresses it imported from
// the stack's OSM extract. Both are in-memory index lookups (FST for text,
// R-tree for coordinates), so these are the fastest reads on the platform.
//
// The forward queries are derived from streets geokode actually holds, not
// hardcoded: the stack takes any OSM extract, and a fixed query list would
// silently start matching nothing on a different region. A 200 with an empty
// result set measures no index work, so it would look like a speedup.

import { BASE, get, probe, scenario, summaryTo, thresholds } from './lib.js';
import { ORIGIN } from '../geo.js';

const GEOCODE = `${BASE}/api/geocode`;

const SPECS = [
  { op: 'forward', target: 'addresses', p95: 1000 },
  { op: 'reverse', target: 'addresses', p95: 1000 },
];

export const options = {
  scenarios: scenario('geokode'),
  thresholds: thresholds(SPECS),
};

export function setup() {
  const res = probe(`${GEOCODE}/reverse?lon=${ORIGIN[0]}&lat=${ORIGIN[1]}&limit=30`);
  if (res.status !== 200) {
    console.warn(`geokode reverse -> ${res.status}: no forward queries derived, ops skipped`);
    return { queries: [] };
  }
  // A prefix rather than the whole street, so the text index ranks candidates
  // instead of matching a single row.
  const queries = [
    ...new Set(
      res
        .json()
        .results.map((r) => r.address && r.address.street)
        .filter((s) => s && s.length >= 5)
        .map((s) => s.slice(0, 5).toLowerCase()),
    ),
  ];
  if (!queries.length) console.warn('geokode returned no streets, ops skipped');
  else console.log(`geokode: ${queries.length} derived queries`);
  return { queries };
}

export default function (data) {
  if (!data.queries.length) return;
  const q = data.queries[Math.floor(Math.random() * data.queries.length)];
  get(SPECS[0], `${GEOCODE}/forward?q=${encodeURIComponent(q)}&limit=10`);
  // jitter around the region origin so every VU is not hitting one R-tree leaf
  const lon = ORIGIN[0] + (Math.random() - 0.5) * 0.05;
  const lat = ORIGIN[1] + (Math.random() - 0.5) * 0.05;
  get(SPECS[1], `${GEOCODE}/reverse?lon=${lon}&lat=${lat}&limit=5`);
}

export const handleSummary = summaryTo(`${__ENV.LOADTEST_OUT || 'out'}/geokode.json`);
