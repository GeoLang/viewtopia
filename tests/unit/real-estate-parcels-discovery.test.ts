import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverParcelsBranch } from '../../src/lib/realEstate';

const REAL_PARCELS_BRANCH = 'branch-real';
const DEMO_PARCELS_BRANCH = 'branch-demo';

function stubPtolemy(datasetNames: string[]) {
  const datasets = datasetNames.map((name) => ({ id: `dataset-${name}`, name }));
  const branchesByDataset: Record<string, string> = {
    'dataset-parcels': REAL_PARCELS_BRANCH,
    'dataset-demo_parcels': DEMO_PARCELS_BRANCH,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.replace('/api/v1', '');
      if (path === '/datasets') {
        return new Response(JSON.stringify(datasets));
      }
      const datasetId = path.replace('/datasets/', '').replace('/branches', '');
      return new Response(
        JSON.stringify([{ id: branchesByDataset[datasetId], name: 'main' }]),
      );
    }),
  );
}

describe('parcels dataset discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers the real parcels dataset over the demo one', async () => {
    stubPtolemy(['demo_sales', 'demo_parcels', 'parcels']);
    await expect(discoverParcelsBranch()).resolves.toBe(REAL_PARCELS_BRANCH);
  });

  it('falls back to demo_parcels when no real parcels are loaded', async () => {
    stubPtolemy(['demo_sales', 'demo_parcels']);
    await expect(discoverParcelsBranch()).resolves.toBe(DEMO_PARCELS_BRANCH);
  });

  it('returns null when neither dataset exists', async () => {
    stubPtolemy(['demo_sales']);
    await expect(discoverParcelsBranch()).resolves.toBeNull();
  });
});
