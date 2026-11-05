import { afterEach, describe, expect, it, vi } from 'vitest';
import { pointWkbHex, ptolemyClient } from '../../scripts/ptolemy-seed.mjs';
import { assetElements, elementFeatures, rowUpdate, syncAssetFeatures } from '../../scripts/seed-twin.mjs';

const TILETOPIA = 'http://tiletopia.test';
const PTOLEMY = 'http://ptolemy.test/api/v1';
const DATASET = 'twin-assets-asset-1';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
}

function locatedElement(id: string, longitude: number) {
  return {
    id,
    label: `Pump ${id}`,
    ifcClass: 'IfcPump',
    storey: 'Level 1',
    location: { center: { longitude, latitude: 43.73, height: 12 }, radius: 0.5 },
  };
}

function storedRow(
  featureId: string,
  assetId: string,
  longitude: number,
  properties: Record<string, unknown> = {},
) {
  return {
    id: featureId,
    dataset_id: 'dataset-1',
    geometry_wkb: [...Buffer.from(pointWkbHex(longitude, 43.73), 'hex')],
    properties: { asset_id: assetId, name: `Pump ${assetId}`, class: 'IfcPump', storey: 'Level 1', ...properties },
  };
}

function modelFeature(element: ReturnType<typeof locatedElement>) {
  return elementFeatures([element]).features[0];
}

interface Commit {
  message: string;
  operations: { type: string; feature_id: string; geometry_wkb_hex?: string; properties?: Record<string, unknown> }[];
}

function fakePtolemy(rowPages: Record<string, unknown>, commits: Commit[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/api/v1/datasets') return jsonResponse([{ id: 'dataset-1', name: DATASET }]);
    if (pathname === '/api/v1/datasets/dataset-1/branches') {
      return jsonResponse([{ id: 'branch-1', name: 'main' }]);
    }
    if (pathname === '/api/v1/branches/branch-1/features') {
      return jsonResponse(rowPages[searchParams.get('cursor') ?? 'first']);
    }
    if (pathname === '/api/v1/branches/branch-1/commit' && init?.method === 'POST') {
      commits.push(JSON.parse(String(init.body)));
      return jsonResponse({}, 201);
    }
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('elementFeatures', () => {
  it('maps each located element to a point keyed by its GlobalId', () => {
    const { features, unplaced } = elementFeatures([
      locatedElement('2O2Fr$t4X7Zf8NOew3FLOH', 7.42),
      { id: '0Storey000000000000000', label: 'Level 1', ifcClass: 'IfcBuildingStorey', storey: null },
    ]);
    expect(unplaced).toBe(1);
    expect(features).toEqual([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [7.42, 43.73] },
        properties: {
          asset_id: '2O2Fr$t4X7Zf8NOew3FLOH',
          name: 'Pump 2O2Fr$t4X7Zf8NOew3FLOH',
          class: 'IfcPump',
          storey: 'Level 1',
        },
      },
    ]);
  });
});

describe('assetElements', () => {
  it('follows the continuation token to the last page and keeps the class filter', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!new URL(url).searchParams.has('continuationToken')) {
        return jsonResponse({
          items: [locatedElement('A', 1), locatedElement('B', 2)],
          total: 3,
          continuationToken: '2',
        });
      }
      return jsonResponse({ items: [locatedElement('C', 3)], total: 3 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const elements = await assetElements({
      tiletopiaUrl: TILETOPIA,
      assetId: 'asset-1',
      ifcClasses: ['IfcPump', 'IfcFan'],
      token: 'element-token',
    });

    expect(elements.map((element: { id: string }) => element.id)).toEqual(['A', 'B', 'C']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = new URL(fetchMock.mock.calls[1][0]);
    expect(second.pathname).toBe('/v1/assets/asset-1/elements');
    expect(second.searchParams.get('continuationToken')).toBe('2');
    expect(JSON.parse(second.searchParams.get('filter') ?? '')).toEqual({
      '@classFullName': { $in: ['IfcPump', 'IfcFan'] },
    });
  });

  it('raises with the answer of a refused page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 'ASSET_HAS_NO_ELEMENT_STORE', message: 'no store' }, 404)),
    );
    await expect(
      assetElements({ tiletopiaUrl: TILETOPIA, assetId: 'asset-1', ifcClasses: [], token: 'element-token' }),
    ).rejects.toThrow(/404.*ASSET_HAS_NO_ELEMENT_STORE/);
  });
});

describe('syncAssetFeatures', () => {
  it('deletes rows for elements gone from the model and inserts new ones', async () => {
    const commits: Commit[] = [];
    vi.stubGlobal(
      'fetch',
      fakePtolemy(
        {
          first: { features: [storedRow('feature-kept', 'KEPT', 1)], next_cursor: 'feature-kept' },
          'feature-kept': { features: [storedRow('feature-gone', 'GONE', 3)], next_cursor: null },
        },
        commits,
      ),
    );
    const { features } = elementFeatures([locatedElement('KEPT', 1), locatedElement('NEW', 2)]);

    const result = await syncAssetFeatures(ptolemyClient('test', PTOLEMY), DATASET, features);

    expect(result).toEqual({
      datasetId: 'dataset-1',
      branchId: 'branch-1',
      inserted: 1,
      updated: 0,
      deleted: 1,
      unchanged: 1,
    });
    expect(commits).toHaveLength(1);
    const [deletion, insertion] = commits[0].operations;
    expect(deletion).toEqual({ type: 'delete', feature_id: 'feature-gone' });
    expect(insertion.type).toBe('insert');
    expect(insertion.properties?.asset_id).toBe('NEW');
    expect(insertion.geometry_wkb_hex).toBe(pointWkbHex(2, 43.73));
    expect(commits[0].operations).toHaveLength(2);
  });

  it('updates rows whose element was renamed or moved and leaves the rest', async () => {
    const commits: Commit[] = [];
    vi.stubGlobal(
      'fetch',
      fakePtolemy(
        {
          first: {
            features: [
              storedRow('feature-same', 'SAME', 1),
              storedRow('feature-renamed', 'RENAMED', 2, { name: 'Old pump' }),
              storedRow('feature-moved', 'MOVED', 3),
              storedRow('feature-gone', 'GONE', 4),
            ],
            next_cursor: null,
          },
        },
        commits,
      ),
    );
    const { features } = elementFeatures([
      locatedElement('SAME', 1),
      locatedElement('RENAMED', 2),
      locatedElement('MOVED', 3.001),
      locatedElement('NEW', 5),
    ]);

    const result = await syncAssetFeatures(ptolemyClient('test', PTOLEMY), DATASET, features);

    expect(result).toEqual({
      datasetId: 'dataset-1',
      branchId: 'branch-1',
      inserted: 1,
      updated: 2,
      deleted: 1,
      unchanged: 1,
    });
    expect(commits).toHaveLength(1);
    const [deletion, rename, move, insertion] = commits[0].operations;
    expect(deletion).toEqual({ type: 'delete', feature_id: 'feature-gone' });
    expect(rename).toEqual({
      type: 'update',
      feature_id: 'feature-renamed',
      properties: { asset_id: 'RENAMED', name: 'Pump RENAMED', class: 'IfcPump', storey: 'Level 1' },
    });
    expect(move).toEqual({
      type: 'update',
      feature_id: 'feature-moved',
      geometry_wkb_hex: pointWkbHex(3.001, 43.73),
    });
    expect(insertion.type).toBe('insert');
    expect(insertion.properties?.asset_id).toBe('NEW');
    expect(commits[0].operations).toHaveLength(4);
  });

  it('commits nothing when every row matches its element', async () => {
    const commits: Commit[] = [];
    vi.stubGlobal(
      'fetch',
      fakePtolemy({ first: { features: [storedRow('feature-same', 'SAME', 1)], next_cursor: null } }, commits),
    );

    const result = await syncAssetFeatures(
      ptolemyClient('test', PTOLEMY),
      DATASET,
      elementFeatures([locatedElement('SAME', 1)]).features,
    );

    expect(result).toMatchObject({ inserted: 0, updated: 0, deleted: 0, unchanged: 1 });
    expect(commits).toHaveLength(0);
  });

  it('splits a large model across commits', async () => {
    const commits: Commit[] = [];
    vi.stubGlobal(
      'fetch',
      fakePtolemy({ first: { features: [], next_cursor: null } }, commits),
    );
    const elements = Array.from({ length: 1001 }, (_entry, index) => locatedElement(`E${index}`, index));

    const result = await syncAssetFeatures(
      ptolemyClient('test', PTOLEMY),
      DATASET,
      elementFeatures(elements).features,
    );

    expect(result.inserted).toBe(1001);
    expect(commits.map((commit) => commit.operations.length)).toEqual([500, 500, 1]);
  });
});

describe('rowUpdate', () => {
  it('treats a position within a tenth of a microdegree as unchanged', () => {
    const row = storedRow('feature-1', 'PUMP', 7.42);
    expect(rowUpdate(row, modelFeature(locatedElement('PUMP', 7.42 + 5e-8)))).toBeNull();
  });

  it('writes only the geometry of a moved element', () => {
    const row = storedRow('feature-1', 'PUMP', 7.42);
    expect(rowUpdate(row, modelFeature(locatedElement('PUMP', 7.420001)))).toEqual({
      type: 'update',
      feature_id: 'feature-1',
      geometry_wkb_hex: pointWkbHex(7.420001, 43.73),
    });
  });

  it('writes the element fields over the stored ones and keeps fields the model lacks', () => {
    const row = storedRow('feature-1', 'PUMP', 7.42, { storey: 'Level 2', note: 'checked' });
    expect(rowUpdate(row, modelFeature(locatedElement('PUMP', 7.42)))).toEqual({
      type: 'update',
      feature_id: 'feature-1',
      properties: { asset_id: 'PUMP', name: 'Pump PUMP', class: 'IfcPump', storey: 'Level 1', note: 'checked' },
    });
  });

  it('reads a big-endian point as PostGIS may serve it', () => {
    const bytes = Buffer.alloc(21);
    bytes.writeUInt8(0, 0);
    bytes.writeUInt32BE(1, 1);
    bytes.writeDoubleBE(7.42, 5);
    bytes.writeDoubleBE(43.73, 13);
    const row = { ...storedRow('feature-1', 'PUMP', 7.42), geometry_wkb: [...bytes] };
    expect(rowUpdate(row, modelFeature(locatedElement('PUMP', 7.42)))).toBeNull();
  });
});
