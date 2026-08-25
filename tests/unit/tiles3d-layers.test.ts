import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDocumentBridge } from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveLayerEntry } from '../../src/live/types';
import { assetFeatureProperties, withAssetProperties } from '../../src/live/assetFeatures';
import { assetColorConditions } from '../../src/hooks/useAssetColorsCesium';
import type { AssetState } from '../../src/live/assetState';
import type { AssetRule } from '../../src/live/types';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { setLayerVisible } from '../../src/store/layerControls';
import { loadedTileset, useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const TILESET_URL = '/tiles/v1/assets/a1b2/tileset.json';
const AT = '2026-08-25T10:00:00Z';

const RULE: AssetRule = {
  layerId: 'twin-model',
  kind: 'temperature',
  breakpoints: [
    { value: 0, color: '#2ecc71' },
    { value: 25, color: '#f1c40f' },
    { value: 30, color: '#e74c3c' },
  ],
  defaultColor: '#95a5a6',
  offlineColor: '#7f8c8d',
};

const asset = (overrides: Partial<AssetState> = {}): AssetState => ({
  feed: 'feed-1',
  online: true,
  values: { temperature: { value: 21, at: AT } },
  ...overrides,
});

describe('the 3D tileset layer store', () => {
  beforeEach(() => {
    useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  });

  it('replaces a layer written under an id it already holds', () => {
    const store = useTiles3dLayerStore.getState();
    store.putLayer({ id: 'a1b2', name: 'quarry', url: TILESET_URL, visible: true });
    store.putLayer({ id: 'a1b2', name: 'quarry v2', url: TILESET_URL, visible: false });

    expect(useTiles3dLayerStore.getState().layers).toEqual([
      { id: 'a1b2', name: 'quarry v2', url: TILESET_URL, visible: false },
    ]);
  });

  it('drops the primitive with the layer', () => {
    const store = useTiles3dLayerStore.getState();
    store.putLayer({ id: 'a1b2', name: 'quarry', url: TILESET_URL, visible: true });
    store.setLoaded('a1b2', { name: 'tileset' } as never);
    store.removeLayer('a1b2');

    expect(useTiles3dLayerStore.getState().layers).toEqual([]);
    expect(useTiles3dLayerStore.getState().loaded).toEqual({});
  });

  it('leaves the layers alone when the shared switch names another store', () => {
    const store = useTiles3dLayerStore.getState();
    store.putLayer({ id: 'a1b2', name: 'quarry', url: TILESET_URL, visible: true });
    const before = useTiles3dLayerStore.getState().layers;

    setLayerVisible('somebody-elses-layer', false);
    expect(useTiles3dLayerStore.getState().layers).toBe(before);

    setLayerVisible('a1b2', false);
    expect(useTiles3dLayerStore.getState().layers[0].visible).toBe(false);
  });

  it('answers loadedTileset once the Cesium hook has the primitive', async () => {
    const tileset = { name: 'tileset' };
    const waiting = loadedTileset('a1b2');
    useTiles3dLayerStore.getState().setLoaded('a1b2', tileset as never);
    await expect(waiting).resolves.toBe(tileset);
    // one already loaded answers without waiting for another write
    await expect(loadedTileset('a1b2')).resolves.toBe(tileset);
  });
});

describe('assetColorConditions', () => {
  it('gives every known asset its colour and leaves the rest as they were', () => {
    const conditions = assetColorConditions(
      RULE,
      {
        'BOX-01': asset({ values: { temperature: { value: 31, at: AT } } }),
        'BOX-02': asset({ online: false }),
      },
      'color("#123456")',
    );
    expect(conditions).toEqual([
      [`\${asset_id} === "BOX-01"`, 'color("#e74c3c")'],
      [`\${asset_id} === "BOX-02"`, 'color("#7f8c8d")'],
      ['true', 'color("#123456")'],
    ]);
  });

  it('paints a tile feature white when the tileset had no colour of its own', () => {
    expect(assetColorConditions(RULE, {})).toEqual([['true', 'color("white")']]);
  });
});

describe('the attributes beside a picked tile feature', () => {
  const layer = (features: GeoJSON.Feature[]) => ({
    id: 'twin-assets',
    name: 'Twin assets',
    geojson: { type: 'FeatureCollection' as const, features },
  });

  const feature = (properties: Record<string, unknown>): GeoJSON.Feature => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties,
  });

  it('finds the ptolemy feature carrying the tile feature asset id', () => {
    const layers = [
      layer([feature({ asset_id: 'BOX-01', name: 'Unit 1' })]),
      layer([feature({ asset_id: 'BOX-02', name: 'Unit 2' })]),
    ];
    expect(assetFeatureProperties('BOX-02', layers)).toEqual({
      asset_id: 'BOX-02',
      name: 'Unit 2',
    });
    expect(assetFeatureProperties('BOX-09', layers)).toBeNull();
  });

  it('reads the features before symbology baked colours into them', () => {
    const styled = {
      ...layer([feature({ asset_id: 'BOX-01', 'marker-color': '#ff0000' })]),
      sourceGeojson: {
        type: 'FeatureCollection' as const,
        features: [feature({ asset_id: 'BOX-01', name: 'Unit 1' })],
      },
    };
    expect(assetFeatureProperties('BOX-01', [styled])).toEqual({
      asset_id: 'BOX-01',
      name: 'Unit 1',
    });
  });

  it('adds the asset rows under the tile own rows, keeping what the tile said', () => {
    const rows = [
      { id: 'asset_id', value: 'BOX-01' },
      { id: 'name', value: 'Box 01' },
    ];
    expect(withAssetProperties(rows, { asset_id: 'BOX-01', name: 'Unit 1', type: 'chiller' })).toEqual([
      { id: 'asset_id', value: 'BOX-01' },
      { id: 'name', value: 'Box 01' },
      { id: 'type', value: 'chiller' },
    ]);
    expect(withAssetProperties(rows, null)).toBe(rows);
  });
});

describe('a 3D tileset in a live document', () => {
  let server: FakeAgoraServer;
  let stopBridge: () => void;

  const peerEntry = (overrides: Partial<LiveLayerEntry> = {}): LiveLayerEntry => ({
    layerId: 'theirs',
    name: 'Their model',
    type: 'tiles3d',
    visible: true,
    opacity: 1,
    order: 'V',
    source: { kind: 'tiles3d', url: 'https://theirs.example/tileset.json' },
    ...overrides,
  });

  const entryFor = (id: string) => useLiveStore.getState().document.layers[id];
  const tiles3dLayer = (id: string) =>
    useTiles3dLayerStore.getState().layers.find((layer) => layer.id === id);

  const goLive = () => {
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit' });
    server.accept();
  };

  beforeEach(() => {
    useAppStore.setState({ layers: [] });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [] });
    useTiles3dLayerStore.setState({ layers: [], loaded: {} });
    server = new FakeAgoraServer();
    server.document = emptyLiveDocument('shared map');
    server.install();
    stopBridge = startDocumentBridge();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    stopBridge();
    server.restore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('publishes the tileset url alone', () => {
    goLive();
    useTiles3dLayerStore
      .getState()
      .putLayer({ id: 'a1b2', name: 'quarry', url: TILESET_URL, visible: true });

    expect(entryFor('a1b2')).toMatchObject({
      layerId: 'a1b2',
      name: 'quarry',
      type: 'tiles3d',
      visible: true,
      opacity: 1,
      source: { kind: 'tiles3d', url: TILESET_URL },
    });
    // the row the layer manager gives it
    expect(useAppStore.getState().layers.map((layer) => layer.type)).toEqual(['tiles3d']);
  });

  it('deletes the entry when the layer is removed locally', () => {
    goLive();
    const store = useTiles3dLayerStore.getState();
    store.putLayer({ id: 'a1b2', name: 'quarry', url: TILESET_URL, visible: true });
    store.removeLayer('a1b2');

    expect(entryFor('a1b2')).toBeUndefined();
  });

  it('draws a peer model under the id the document gave it', () => {
    goLive();
    const sent = server.connection.editsSent.length;
    server.applyFromPeer('ada', 'layers/theirs', peerEntry({ visible: false }));

    expect(tiles3dLayer('theirs')).toEqual({
      id: 'theirs',
      name: 'Their model',
      url: 'https://theirs.example/tileset.json',
      visible: false,
    });
    expect(server.connection.editsSent).toHaveLength(sent);
  });

  it('follows a peer switch and removes the layer with the entry', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/theirs', peerEntry());
    expect(tiles3dLayer('theirs')?.visible).toBe(true);

    server.applyFromPeer('ada', 'layers/theirs', peerEntry({ visible: false }));
    expect(tiles3dLayer('theirs')?.visible).toBe(false);

    server.applyFromPeer('ada', 'layers/theirs', null);
    expect(tiles3dLayer('theirs')).toBeUndefined();
  });
});
