// Shared plumbing for the k6 scenarios.
//
// Every script drives its requests from a table of op specs, and derives its
// thresholds from that same table, so a new target cannot be added without a
// latency threshold attached to it.

import http from 'k6/http';
import { check } from 'k6';

export const BASE = (__ENV.LOADTEST_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
// fenestra is not behind the viewtopia proxy, so it is addressed directly
export const FENESTRA = (__ENV.LOADTEST_FENESTRA_URL || 'http://localhost:3003').replace(/\/$/, '');
export const API = `${BASE}/api/v1`;

// Reads are unauthenticated on a public dataset, so the token is optional. Set
// it (loadtest/run.sh does) to measure the path the viewer actually takes.
const TOKEN = __ENV.LOADTEST_TOKEN || '';
export const HEADERS = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
export const JSON_HEADERS = { 'Content-Type': 'application/json', ...HEADERS };

export const VUS = Number(__ENV.LOADTEST_VUS || 5);
export const DURATION = __ENV.LOADTEST_DURATION || '30s';
export const RATE = Number(__ENV.LOADTEST_RATE || 20);

export const DEPTHS = (__ENV.LOADTEST_DEPTHS || '100,1000,10000')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

// A fixed arrival rate, not a fixed VU count: this harness measures latency at a
// defined load, and looping VUs with no think time instead measure "how fast can
// the box be saturated". Unpaced, 5 VUs push ~2900 req/s through the proxy, which
// makes nginx shed connections and reports 502s as if the service regressed.
//
// If the stack cannot sustain the rate, k6 warns that it has run out of VUs and
// drops iterations. That warning is itself a result: read it, do not just raise
// maxVUs.
export function scenario(service) {
  return {
    [service]: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 10,
      tags: { service },
    },
  };
}

// p95 per op+target, plus an error budget per op+target and one for the run.
// `specs` is the same array the default function iterates.
export function thresholds(specs) {
  const out = { http_req_failed: ['rate<0.01'] };
  for (const s of specs) {
    const sub = `{op:${s.op},target:${s.target}}`;
    out[`http_req_duration${sub}`] = [`p(95)<${s.p95}`];
    out[`http_req_failed${sub}`] = ['rate<0.01'];
    // k6 only materializes a sub-metric that some threshold names, so this
    // always-true one is what puts per-op req/s in the summary. Not a gate.
    out[`http_reqs${sub}`] = ['rate>=0'];
  }
  return out;
}

// k6's `name` tag defaults to the full URL, so scenarios that vary coordinates
// or ids per request would mint one time series per request and blow up memory.
// Naming every request after its op collapses them into one series.
const tagsFor = (spec) => ({
  op: spec.op,
  target: spec.target,
  name: `${spec.op} ${spec.target}`,
});

/** GET, tagged for the sub-metric thresholds, with a status check. */
export function get(spec, url, params = {}) {
  const res = http.get(url, {
    ...params,
    headers: { ...HEADERS, ...(params.headers || {}) },
    tags: tagsFor(spec),
  });
  check(res, { [`${spec.op} ${spec.target} 200`]: (r) => r.status === 200 });
  return res;
}

/** POST with a JSON body, same tagging. */
export function postJson(spec, url, body) {
  const res = http.post(url, JSON.stringify(body), {
    headers: JSON_HEADERS,
    tags: tagsFor(spec),
  });
  check(res, { [`${spec.op} ${spec.target} 200`]: (r) => r.status === 200 });
  return res;
}

// ─── setup() helpers ────────────────────────────────────────────────

// Discovery requests must not count toward the error gate. A 404 from a probe
// that is asking "does this route?" is the answer, not a failure, and a setup
// request that fails would otherwise be the only sample in the metric and make
// the run look 100% broken.
const PROBE_OK = http.expectedStatuses({ min: 200, max: 599 });

/** GET for use inside setup(), excluded from the error-rate metrics. */
export function probe(url, params = {}) {
  return http.get(url, {
    ...params,
    headers: { ...HEADERS, ...(params.headers || {}) },
    responseCallback: PROBE_OK,
    tags: { op: 'setup', target: 'discovery' },
  });
}

/** Dataset id by name, or null when the seeder has not run for it. */
export function datasetId(name) {
  const res = probe(`${API}/datasets`);
  if (res.status !== 200) throw new Error(`GET /datasets -> ${res.status}: ${res.body}`);
  const found = res.json().find((d) => d.name === name);
  return found ? found.id : null;
}

export function mainBranchId(dataset) {
  const res = probe(`${API}/datasets/${dataset}/branches`);
  if (res.status !== 200) return null;
  const branches = res.json();
  const main = branches.find((b) => b.name === 'main') || branches[0];
  return main ? main.id : null;
}

/** One feature id from a branch, for the single-feature GET. */
export function anyFeatureId(branch) {
  const res = probe(`${API}/branches/${branch}/features?limit=1`);
  if (res.status !== 200) return null;
  const features = res.json().features;
  return features && features.length ? features[0].id : null;
}

/** Resolve a seeded dataset to the ids the scenarios need, or null if absent. */
export function resolveTarget(name) {
  const dataset = datasetId(name);
  if (!dataset) {
    console.warn(`target ${name} is not seeded, its ops will be skipped`);
    return null;
  }
  const branch = mainBranchId(dataset);
  if (!branch) {
    console.warn(`target ${name} has no branch, its ops will be skipped`);
    return null;
  }
  return { name, dataset, branch, feature: anyFeatureId(branch) };
}

// Defining handleSummary suppresses k6's own end-of-test report, so print the
// per-target percentiles the run exists to produce, and keep the full JSON for CI.
export function summaryTo(path) {
  return (data) => {
    // k6 adds an http_req_duration{expected_response:true} sub-metric of its
    // own, and only the op/target ones this harness declares are interesting.
    const rows = Object.keys(data.metrics)
      .filter((name) => name.startsWith('http_req_duration{op:'))
      .sort()
      .map((name) => {
        const v = data.metrics[name].values;
        const reqs = data.metrics[name.replace('http_req_duration', 'http_reqs')];
        return (
          `  ${name.slice('http_req_duration'.length)}  ` +
          `p50 ${v.med.toFixed(0)}ms  p95 ${v['p(95)'].toFixed(0)}ms  ` +
          `req/s ${reqs ? reqs.values.rate.toFixed(1) : '?'}`
        );
      });
    const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values.rate.toFixed(1) : '0';
    const failed = data.metrics.http_req_failed
      ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2)
      : '0';
    return {
      [path]: JSON.stringify(data, null, 2),
      stdout: `\n${rows.join('\n')}\n  overall ${reqs} req/s, ${failed}% failed\n`,
    };
  };
}
