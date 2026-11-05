import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  BoundingSphere,
  Cartesian3,
  Matrix4,
  Transforms,
  type Cesium3DTileFeature,
  type Cesium3DTileset,
  type Viewer,
} from 'cesium';
import '../../src/actions/tileset';
import { NO_CESIUM_GLOBE } from '../../src/actions/globe';
import { findAction, runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { ELEMENT_ID_LIMIT, useElementStore } from '../../src/features/elements/store';
import { useElementStyleCesium } from '../../src/features/elements/useElementStyleCesium';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import {
  FakeElementServer,
  fakeTileFeature,
  type ElementServerRequest,
} from './stubs/fakeElementServer';

const MODEL_LAYER = { id: 'a1b2', name: 'model.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const ELEMENT_ACTIONS = ['tileset.select_elements', 'tileset.isolate_elements', 'tileset.hide_elements'];
const DOOR_FILTER = { '@classFullName': 'IfcDoor', '@storey': 'Level 3' };
const LOCATION = { center: { longitude: -71.061, latitude: 42.357, height: 12.5 }, radius: 4.2 };
const WITH_ELEMENT_IDS = { featuresLength: 2, trianglesLength: 12, hasProperty: () => true };

const requestRender = vi.fn();
let server: FakeElementServer;
let tileset: Cesium3DTileset;

function fakeTileset(content: unknown = WITH_ELEMENT_IDS): Cesium3DTileset {
  const placement = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));
  const sphere = new BoundingSphere(
    Matrix4.multiplyByPoint(placement, new Cartesian3(0, 0, 10), new Cartesian3()),
    20,
  );
  return {
    isDestroyed: () => false,
    style: undefined,
    clippingPlanes: undefined,
    boundingSphere: sphere,
    root: { computedTransform: placement, boundingSphere: sphere, content, children: [] },
  } as unknown as Cesium3DTileset;
}

function row(id: string, meshed = true) {
  return {
    id,
    label: null,
    ifcClass: 'IfcWall',
    storey: 'Level 3',
    ...(meshed ? { location: LOCATION } : {}),
  };
}

function page(count: number) {
  return {
    items: Array.from({ length: count }, (_, index) => row(`door-${index}`)),
    total: count,
  };
}

function filterOf({ url }: ElementServerRequest) {
  return JSON.parse(url.searchParams.get('filter') ?? '{}');
}

function answerIds(known: string[]) {
  return (request: ElementServerRequest) => {
    const asked: string[] = filterOf(request)['@id']?.$in ?? [];
    return { body: { items: asked.filter((id) => known.includes(id)).map((id) => row(id)), total: 1 } };
  };
}

function feature(id: string): Cesium3DTileFeature {
  return fakeTileFeature({ asset_id: id }) as unknown as Cesium3DTileFeature;
}

beforeEach(() => {
  server = new FakeElementServer();
  server.install();
  requestRender.mockClear();
  tileset = fakeTileset();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useElementStore.setState({
    model: null,
    selected: new Set(),
    hidden: new Set(),
    isolated: null,
    focused: null,
  });
  useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { a1b2: tileset } });
  setActiveCesiumViewer({ isDestroyed: () => false, scene: { requestRender } } as unknown as Viewer);
});

afterEach(() => {
  server.restore();
  setActiveCesiumViewer(null);
});

function storeIsEmpty(): boolean {
  const store = useElementStore.getState();
  return store.selected.size + store.hidden.size === 0 && store.isolated === null;
}

describe.each(ELEMENT_ACTIONS)('%s', (name) => {
  it('refuses a call with neither ids nor filter, naming itself', async () => {
    await expect(runAction(name, {})).rejects.toThrow(`${name} takes ids or filter, and it was sent neither`);
  });

  it('refuses a call with both ids and filter, naming itself', async () => {
    await expect(runAction(name, { ids: ['a'], filter: DOOR_FILTER })).rejects.toThrow(
      `${name} takes ids or filter, and it was sent both`,
    );
    expect(server.requests).toEqual([]);
  });

  it('sends its text back to the model as the next turn', () => {
    expect(findAction(name)?.reads).toBe(true);
  });

  it('refuses a filter past the limit, changing nothing', async () => {
    server.answer = () => ({
      body: { items: [], total: ELEMENT_ID_LIMIT + 1, continuationToken: '1000' },
    });

    await expect(runAction(name, { filter: {} })).rejects.toThrow(
      `${ELEMENT_ID_LIMIT + 1} elements match, over the limit of ${ELEMENT_ID_LIMIT}`,
    );
    expect(storeIsEmpty()).toBe(true);
  });

  it('refuses ids that are not strings, and a choice beside clear', async () => {
    await expect(runAction(name, { ids: [7] })).rejects.toThrow('ids is a list of GlobalId strings, not 7');
    await expect(runAction(name, { clear: true, ids: ['a'] })).rejects.toThrow(
      'clear takes no choice of elements, not ids',
    );
  });

  it('says the globe is not on screen', async () => {
    setActiveCesiumViewer(null);

    await expect(runAction(name, { ids: ['a'] })).rejects.toThrow(NO_CESIUM_GLOBE);
  });

  it('reports no success when every id is unknown, and changes nothing', async () => {
    server.answer = answerIds([]);

    await expect(runAction(name, { ids: ['a', 'b'] })).rejects.toThrow(
      'no element of model.ifc with a mesh matches that choice, so nothing changed: 2 ids not found',
    );
    expect(storeIsEmpty()).toBe(true);
  });

  it('reports no success for a filter that matches nothing', async () => {
    server.answer = () => ({ body: page(0) });

    await expect(runAction(name, { filter: DOOR_FILTER })).rejects.toThrow(
      'no element of model.ifc with a mesh matches that choice, so nothing changed',
    );
  });

  it('reports no success for a filter that matches only what has no mesh', async () => {
    server.answer = () => ({ body: { items: [row('space-1', false), row('space-2', false)], total: 2 } });

    await expect(runAction(name, { filter: { '@classFullName': 'IfcSpace' } })).rejects.toThrow(
      'so nothing changed: 2 elements have no mesh',
    );
    expect(storeIsEmpty()).toBe(true);
  });

  it('reports no count on tiles with no asset_id column, asking the server nothing', async () => {
    const without = fakeTileset({ featuresLength: 2, trianglesLength: 12, hasProperty: () => false });
    useTiles3dLayerStore.setState({ loaded: { a1b2: without } });

    await expect(runAction(name, { ids: ['a'] })).rejects.toThrow(
      'model.ifc has no asset_id column on its tile features',
    );
    expect(server.requests).toEqual([]);
    expect(storeIsEmpty()).toBe(true);
  });

  it('counts tiles with no feature ids at all as having no asset_id column', async () => {
    const without = fakeTileset({ featuresLength: 0, trianglesLength: 12, hasProperty: () => false });
    useTiles3dLayerStore.setState({ loaded: { a1b2: without } });

    await expect(runAction(name, { ids: ['a'] })).rejects.toThrow('has no asset_id column');
  });

  it('says the column is unconfirmed while no tile has loaded', async () => {
    const unloaded = fakeTileset({ featuresLength: 0, trianglesLength: 0, hasProperty: () => false });
    useTiles3dLayerStore.setState({ loaded: { a1b2: unloaded } });
    server.answer = answerIds(['a']);

    const result = await runAction(name, { ids: ['a'] });

    expect(result.text).toContain('no tile of it has loaded yet, so its asset_id column is unconfirmed');
  });

  it('finds the column on a child tile when the root has no content of its own', async () => {
    const parent = fakeTileset({ featuresLength: 0, trianglesLength: 0, hasProperty: () => false });
    const placement = parent.root as unknown as { children: unknown[] };
    placement.children = [{ content: WITH_ELEMENT_IDS, children: [] }];
    useTiles3dLayerStore.setState({ loaded: { a1b2: parent } });
    server.answer = answerIds(['a']);

    const result = await runAction(name, { ids: ['a'] });

    expect(result.text).not.toContain('unconfirmed');
  });

  it('refuses a model still loading, and one it cannot check with tiletopia', async () => {
    useTiles3dLayerStore.setState({ loaded: {} });
    await expect(runAction(name, { ids: ['a'] })).rejects.toThrow('model.ifc has not finished loading');

    const foreign = { ...MODEL_LAYER, url: 'https://elsewhere.example/tileset.json' };
    useTiles3dLayerStore.setState({ layers: [foreign], loaded: { a1b2: tileset } });
    await expect(runAction(name, { ids: ['a'] })).rejects.toThrow(
      'model.ifc is not a tiletopia asset, so its elements cannot be checked',
    );
    await expect(runAction(name, { filter: DOOR_FILTER })).rejects.toThrow('cannot be checked');
  });
});

describe('choosing which model', () => {
  const other = { id: 'c3d4', name: 'other.ifc', url: '/tiles/v1/assets/c3d4/tileset.json', visible: true };

  it('asks for a layer when several models are on the globe and none is open', async () => {
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER, other], loaded: { a1b2: tileset, c3d4: fakeTileset() } });

    await expect(runAction('tileset.hide_elements', { ids: ['a'] })).rejects.toThrow(
      'layer is required when several models are on the globe: model.ifc, other.ifc',
    );
  });

  it('takes the layer it is named, and asks that model of the server', async () => {
    useTiles3dLayerStore.setState({ layers: [MODEL_LAYER, other], loaded: { a1b2: tileset, c3d4: fakeTileset() } });
    server.answer = () => ({ body: page(1) });

    await runAction('tileset.hide_elements', { layer: 'other.ifc', filter: DOOR_FILTER });

    expect(useElementStore.getState().model?.layerId).toBe('c3d4');
    expect(server.requests[0].path).toBe('/v1/assets/c3d4/elements');
  });
});

describe('tileset.select_elements', () => {
  it('selects the ids the server knows and reports the count', async () => {
    server.answer = answerIds(['a', 'b']);

    const result = await runAction('tileset.select_elements', { ids: ['a', 'b'] });

    expect([...useElementStore.getState().selected]).toEqual(['a', 'b']);
    expect(result.text).toBe('Selected 2 elements in model.ifc.');
  });

  it('clears', async () => {
    server.answer = answerIds(['a']);
    await runAction('tileset.select_elements', { ids: ['a'] });

    const result = await runAction('tileset.select_elements', { clear: true });

    expect(useElementStore.getState().selected.size).toBe(0);
    expect(result.text).toBe('Nothing is selected in model.ifc.');
  });
});

describe('tileset.isolate_elements', () => {
  it('resolves a filter through the element client and reports the resolved count', async () => {
    server.answer = () => ({ body: page(400) });

    const result = await runAction('tileset.isolate_elements', { filter: DOOR_FILTER });

    const [request] = server.requests;
    expect(request.path).toBe('/v1/assets/a1b2/elements');
    expect(request.authorization).toBe('Bearer jwt-token');
    expect(filterOf(request)).toEqual(DOOR_FILTER);
    expect(useElementStore.getState().isolated?.size).toBe(400);
    expect(result.text).toBe('Isolated 400 elements in model.ifc.');
  });

  it('leaves what has no mesh out of the count and says how many', async () => {
    server.answer = () => ({ body: { items: [row('door'), row('space', false)], total: 2 } });

    const result = await runAction('tileset.isolate_elements', { filter: {} });

    expect([...(useElementStore.getState().isolated ?? [])]).toEqual(['door']);
    expect(result.text).toBe('Isolated 1 element in model.ifc, 1 element has no mesh.');
  });

  it('carries the server message for a filter it refuses', async () => {
    server.answer = () => ({
      status: 400,
      body: { code: 'INVALID_FILTER', message: 'unknown operator $near' },
    });

    await expect(runAction('tileset.isolate_elements', { filter: { a: { $near: 1 } } })).rejects.toThrow(
      'unknown operator $near',
    );
  });

  it('ends the isolation', async () => {
    server.answer = answerIds(['a']);
    await runAction('tileset.isolate_elements', { ids: ['a'] });

    const result = await runAction('tileset.isolate_elements', { clear: true });

    expect(useElementStore.getState().isolated).toBeNull();
    expect(result.text).toBe('model.ifc is no longer isolated.');
  });
});

describe('tileset.hide_elements', () => {
  it('reports the real count and how many ids were not found', async () => {
    server.answer = answerIds(['a', 'b', 'c']);

    const result = await runAction('tileset.hide_elements', { ids: ['a', 'b', 'c', 'gone-1', 'gone-2'] });

    expect([...useElementStore.getState().hidden]).toEqual(['a', 'b', 'c']);
    expect(result.text).toBe('Hid 3 elements in model.ifc, 2 ids not found.');
  });

  it('checks ids in batches of one hundred', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    server.answer = answerIds(ids);

    const result = await runAction('tileset.hide_elements', { ids });

    expect(server.requests.map((request) => filterOf(request)['@id'].$in.length)).toEqual([100, 100, 50]);
    expect(result.text).toBe('Hid 250 elements in model.ifc.');
  });

  it('acts on the contents of a storey id, not on the storey', async () => {
    const STOREY = { kind: 'model', key: 'key-storey', id: 'storey', label: 'Level 3', hasChildren: true, ifcClass: 'IfcBuildingStorey' };
    server.answer = (request) => {
      const { path, url } = request;
      if (path.endsWith('/tree/parents')) return { body: { path: [{ kind: 'model', id: 'storey' }] } };
      if (path.endsWith('/tree/children')) {
        return { body: { nodes: url.searchParams.has('nodeKey') ? [] : [STOREY] } };
      }
      if (path.endsWith('/elements/storey')) {
        return { body: { ...row('storey', false), parentId: null, properties: {} } };
      }
      const filter = filterOf(request);
      if (filter['@id']) return { body: { items: [row('storey', false)], total: 1 } };
      if (filter['@classFullName']) return { body: { items: [], total: 1 } };
      return { body: { items: [row('wall'), row('door')], total: 2 } };
    };

    const result = await runAction('tileset.hide_elements', { ids: ['storey'] });

    expect([...useElementStore.getState().hidden].sort()).toEqual(['door', 'wall']);
    expect(result.text).toBe('Hid 2 elements in model.ifc.');
  });

  it('adds to what is hidden, counts one in the singular, and clears', async () => {
    server.answer = answerIds(['a', 'b']);
    await runAction('tileset.hide_elements', { ids: ['a'] });

    const result = await runAction('tileset.hide_elements', { ids: ['b'] });

    expect([...useElementStore.getState().hidden]).toEqual(['a', 'b']);
    expect(result.text).toBe('Hid 1 element in model.ifc.');

    await runAction('tileset.hide_elements', { clear: true });
    expect(useElementStore.getState().hidden.size).toBe(0);
  });

  it('reaches the tile style the viewer area mounts', async () => {
    server.answer = answerIds(['wall']);
    renderHook(() => useElementStyleCesium());

    await act(async () => {
      await runAction('tileset.hide_elements', { ids: ['wall'] });
    });

    expect(tileset.style?.show.evaluate(feature('wall'))).toBe(false);
    expect(tileset.style?.show.evaluate(feature('door'))).toBe(true);
  });
});

describe('tileset.section', () => {
  it('cuts at the middle of the model along z by default, keeping the part below', async () => {
    const result = await runAction('tileset.section', { on: true });

    const plane = tileset.clippingPlanes.get(0);
    expect(plane.normal.z).toBe(-1);
    expect(plane.distance).toBeCloseTo(10, 5);
    expect(tileset.clippingPlanes.enabled).toBe(true);
    expect(requestRender).toHaveBeenCalled();
    expect(result.text).toBe('model.ifc is cut along its z axis at 10.0 metres, keeping the part below.');
  });

  it('takes an axis, a position and a flip', async () => {
    const result = await runAction('tileset.section', { on: true, axis: 'x', position: 3, flip: true });

    const plane = tileset.clippingPlanes.get(0);
    expect(plane.normal.x).toBe(1);
    expect(plane.distance).toBe(-3);
    expect(result.text).toBe('model.ifc is cut along its x axis at 3.0 metres, keeping the part above.');
  });

  it('refuses a position outside the model', async () => {
    await expect(runAction('tileset.section', { on: true, position: 500 })).rejects.toThrow(
      /position on the z axis of model\.ifc is between -10\.0 and 30\.0 metres, not 500/,
    );
  });

  it('puts the model back whole', async () => {
    await runAction('tileset.section', { on: true });

    const result = await runAction('tileset.section', { on: false });

    expect(tileset.clippingPlanes.enabled).toBe(false);
    expect(result.text).toBe('model.ifc is whole again.');
  });

  it('refuses a call with no on, and a layer that is not a model', async () => {
    await expect(runAction('tileset.section', {})).rejects.toThrow('on is required');
    await expect(runAction('tileset.section', { on: true, layer: 'no such layer' })).rejects.toThrow();
  });
});
