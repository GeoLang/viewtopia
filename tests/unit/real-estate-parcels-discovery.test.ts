import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverParcelSource } from '../../src/lib/realEstate';

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

  it('prefers the real parcels dataset and pairs it with sales, never demo_sales', async () => {
    stubPtolemy(['demo_sales', 'demo_parcels', 'parcels']);
    await expect(discoverParcelSource()).resolves.toEqual({
      parcelsBranch: REAL_PARCELS_BRANCH,
      salesDataset: 'sales',
    });
  });

  it('falls back to demo_parcels with demo_sales when no real parcels are loaded', async () => {
    stubPtolemy(['demo_sales', 'demo_parcels']);
    await expect(discoverParcelSource()).resolves.toEqual({
      parcelsBranch: DEMO_PARCELS_BRANCH,
      salesDataset: 'demo_sales',
    });
  });

  it('returns null when neither dataset exists', async () => {
    stubPtolemy(['demo_sales']);
    await expect(discoverParcelSource()).resolves.toBeNull();
  });
});
