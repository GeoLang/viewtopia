// Constants shared by the seeder (node) and the k6 scenarios, so a bbox the
// seeder filled can't drift from the bbox a scenario queries. Plain ESM with no
// node or k6 imports, because both runtimes load this file directly.

// Synthetic origin near Monaco, the stack's default region, so loadtest features
// sit next to the demo data instead of in the ocean.
export const ORIGIN = [7.4, 43.72];

export const DATASET_PREFIX = 'loadtest-';
export const chainDataset = (depth) => `${DATASET_PREFIX}chain-${depth}`;
export const WIDE_DATASET = `${DATASET_PREFIX}wide`;
export const EXTERNAL_DATASET = `${DATASET_PREFIX}external`;
export const EXTERNAL_TABLE = 'loadtest_external_src';

// Chain datasets: a fixed 10x10 grid. Feature count stays constant across
// depths, so a latency difference between depths is the changeset walk and
// nothing else.
export const CHAIN = { features: 100, cols: 10, cell: 0.0005 };
// ~50k features on a square grid.
export const WIDE = { features: 50176, cols: 224, cell: 0.0002 };
export const EXTERNAL = { features: 50176, cols: 224, cell: 0.0002 };

// i-th point of a row-major grid, as [lng, lat].
export function gridPoint(grid, i) {
  return [
    ORIGIN[0] + (i % grid.cols) * grid.cell,
    ORIGIN[1] + Math.floor(i / grid.cols) * grid.cell,
  ];
}

// [min_x, min_y, max_x, max_y] covering `fraction` of the grid's extent.
export function gridBbox(grid, fraction) {
  const rows = Math.ceil(grid.features / grid.cols);
  return [
    ORIGIN[0] - grid.cell,
    ORIGIN[1] - grid.cell,
    ORIGIN[0] + grid.cols * grid.cell * fraction,
    ORIGIN[1] + rows * grid.cell * fraction,
  ];
}

// Chain: the whole grid, so every seeded feature is a candidate and the
// changeset walk dominates. Wide/external: a quarter, to exercise selectivity.
export const CHAIN_BBOX = gridBbox(CHAIN, 1);
export const WIDE_BBOX = gridBbox(WIDE, 0.5);
export const EXTERNAL_BBOX = gridBbox(EXTERNAL, 0.5);

// Property the CQL2 scenario filters on. The seeder writes `bucket` as
// `i % BUCKETS`, so the filter matches a predictable ~1/BUCKETS of the rows.
export const BUCKETS = 20;
export const FILTER_BUCKET = '7';
