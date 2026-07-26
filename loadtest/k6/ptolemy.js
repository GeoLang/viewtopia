// The headline measurement: ptolemy read latency against changeset-chain depth.
//
// Reads resolve a branch by walking a recursive CTE from the branch head up
// changesets.parent_id, so the cost of every listing read grows with the number
// of commits on the branch. The chain-* targets hold an identical 100-feature
// grid at different depths, so a latency gap between them is the walk and
// nothing else.
//
// One iteration touches every op on every target, so all depths are measured
// under the same load and the same cache state. That makes the depth comparison
// valid within a single run, which run-to-run comparison of isolated scenarios
// would not be.
//
// items-get is the control: GET /ogc/collections/{id}/items/{fid} picks the
// newest feature_versions row directly and never walks the chain, so it should
// stay flat as depth grows.

import {
  API,
  DEPTHS,
  get,
  postJson,
  resolveTarget,
  scenario,
  summaryTo,
  thresholds,
} from './lib.js';
import {
  CHAIN_BBOX,
  EXTERNAL_BBOX,
  EXTERNAL_DATASET,
  FILTER_BUCKET,
  WIDE_BBOX,
  WIDE_DATASET,
  chainDataset,
} from '../geo.js';

// p95 budgets in ms, ~2x the 2026-07-26 baseline with a 50ms floor (see
// loadtest/README.md). A tier's budget is 2x the slowest target in it.
const P95 = {
  bbox: { chain: 50, deep: 150, wide: 150, external: 150 },
  filter: { chain: 50, deep: 150, wide: 150, external: 250 },
  item: { chain: 50, deep: 60, wide: 50, external: 150 },
};

// A depth past this is where the walk is expected to hurt, so it gets the
// looser budget. Keeping the split explicit stops a new depth from silently
// inheriting a budget that does not fit it.
const DEEP_FROM = 5000;

function chainSpecs() {
  const specs = [];
  for (const depth of DEPTHS) {
    const target = `chain-${depth}`;
    const tier = Number(depth) >= DEEP_FROM ? 'deep' : 'chain';
    specs.push(
      { op: 'bbox', target, dataset: chainDataset(depth), bbox: CHAIN_BBOX, p95: P95.bbox[tier] },
      { op: 'filter', target, dataset: chainDataset(depth), p95: P95.filter[tier] },
      { op: 'item', target, dataset: chainDataset(depth), p95: P95.item[tier] },
    );
  }
  return specs;
}

export const SPECS = [
  ...chainSpecs(),
  { op: 'bbox', target: 'wide', dataset: WIDE_DATASET, bbox: WIDE_BBOX, p95: P95.bbox.wide },
  { op: 'filter', target: 'wide', dataset: WIDE_DATASET, p95: P95.filter.wide },
  { op: 'item', target: 'wide', dataset: WIDE_DATASET, p95: P95.item.wide },
  {
    op: 'bbox',
    target: 'external',
    dataset: EXTERNAL_DATASET,
    bbox: EXTERNAL_BBOX,
    p95: P95.bbox.external,
  },
  { op: 'filter', target: 'external', dataset: EXTERNAL_DATASET, p95: P95.filter.external },
  { op: 'item', target: 'external', dataset: EXTERNAL_DATASET, p95: P95.item.external },
];

export const options = {
  scenarios: scenario('ptolemy'),
  thresholds: thresholds(SPECS),
};

export function setup() {
  const targets = {};
  for (const name of new Set(SPECS.map((s) => s.dataset))) {
    const resolved = resolveTarget(name);
    if (resolved) targets[name] = resolved;
  }
  return { targets };
}

const bboxQuery = (b) => `min_x=${b[0]}&min_y=${b[1]}&max_x=${b[2]}&max_y=${b[3]}`;

export default function (data) {
  for (const spec of SPECS) {
    const t = data.targets[spec.dataset];
    if (!t) continue;
    if (spec.op === 'bbox') {
      get(spec, `${API}/branches/${t.branch}/features/bbox?${bboxQuery(spec.bbox)}&limit=1000`);
    } else if (spec.op === 'filter') {
      postJson(spec, `${API}/branches/${t.branch}/features/filter`, {
        filter: { op: '=', args: [{ property: 'bucket' }, FILTER_BUCKET] },
        limit: 100,
      });
    } else if (spec.op === 'item' && t.feature) {
      get(spec, `${API}/ogc/collections/${t.dataset}/items/${t.feature}`);
    }
  }
}

export const handleSummary = summaryTo(`${__ENV.LOADTEST_OUT || 'out'}/ptolemy.json`);
