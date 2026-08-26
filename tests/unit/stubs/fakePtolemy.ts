/**
 * Enough of ptolemy for the dataset and scenario actions: datasets, branches,
 * a branch's features at the head or at a moment, and buffered coverage.
 */

export const DATASET = { id: 'd-1', name: 'twin-assets', project_id: null, visibility: 'private' };
export const OTHER_DATASET = { id: 'd-2', name: 'twin-roads', project_id: null, visibility: 'private' };

export const MAIN_BRANCH = { id: 'b-main', name: 'main' };
export const SCENARIO_BRANCH = { id: 'b-sensors', name: 'more sensors' };

/** point (1 2) as ptolemy hands geometry back on /features */
const POINT_WKB_HEX = '0101000000000000000000f03f0000000000000040';

const COVERAGE: Record<string, { feature_count: number; coverage_sq_meters: number }> = {
  [MAIN_BRANCH.id]: { feature_count: 3, coverage_sq_meters: 31_000 },
  [SCENARIO_BRANCH.id]: { feature_count: 4, coverage_sq_meters: 62_000 },
};

function bytes(hex: string): number[] {
  return (hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
}

function feature(id: string) {
  return { id, geometry_wkb: bytes(POINT_WKB_HEX), properties: { name: id } };
}

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Every path the fake was asked for, newest last. */
export const asked: string[] = [];

export function fakePtolemy(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  asked.push(url);
  if (url.endsWith('/api/v1/datasets')) return Promise.resolve(answer([DATASET, OTHER_DATASET]));
  if (url.includes('/datasets/') && url.endsWith('/branches')) {
    return Promise.resolve(answer([MAIN_BRANCH, SCENARIO_BRANCH]));
  }
  const features = /\/branches\/([^/]+)\/features(\/at)?\?/.exec(url);
  if (features) {
    return Promise.resolve(answer({ features: [feature(`${features[1]}-a`), feature(`${features[1]}-b`)] }));
  }
  const coverage = /\/branches\/([^/]+)\/analytics\/coverage\?distance=\d+/.exec(url);
  if (coverage) return Promise.resolve(answer(COVERAGE[coverage[1]]));
  throw new Error(`nothing fake answers ${url}`);
}
