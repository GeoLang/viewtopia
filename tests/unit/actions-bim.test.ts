import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SceneMode, type Cesium3DTileFeature } from 'cesium';
import '../../src/actions/bim';
import { NO_CESIUM_GLOBE } from '../../src/actions/globe';
import { findAction, runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { leaveBimMode } from '../../src/features/bim/bimMode';
import { BIM_MODE_OFF, useBimModeStore } from '../../src/features/bim/store';
import { useElementStore } from '../../src/features/elements/store';
import { useElementStyleCesium } from '../../src/features/elements/useElementStyleCesium';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import { asTileset, asViewer, fakeBimTileset, fakeBimViewer, viewerSettings, type FakeBimViewer } from './stubs/fakeBimViewer';
import { FakeElementServer, fakeTileFeature, type ElementServerRequest } from './stubs/fakeElementServer';

const LAYER = { id: 'a1b2', name: 'tower.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const ELEMENTS_PATH = '/v1/assets/a1b2/elements';

function node(id: string, label: string, ifcClass: string, kind: string, hasChildren: boolean) {
  return { kind, key: `key-${id}`, label, hasChildren, id, ifcClass };
}

const ROOF = node('roof', 'Roof', 'IfcBuildingStorey', 'model', false);
const GROUND = node('ground', 'Ground', 'IfcBuildingStorey', 'model', false);
const LEVEL_1 = node('level-1', 'Level 1', 'IfcBuildingStorey', 'model', false);
const EMPTY = node('empty', 'Empty', 'IfcBuildingStorey', 'model', false);
const BUILDING = node('building', 'Tower', 'IfcBuilding', 'subject', true);
const ANNEX = node('annex', 'Annex', 'IfcBuilding', 'subject', true);
const ANNEX_LOW = node('annex-low', 'Basement', 'IfcBuildingStorey', 'model', false);
const ANNEX_LEVEL_1 = node('annex-1', 'Level 1', 'IfcBuildingStorey', 'model', false);
const PROJECT = node('project', 'Project', 'IfcProject', 'subject', true);

// file order is deliberately not height order
const ONE_BUILDING = {
  root: [PROJECT],
  'key-project': [BUILDING],
  'key-building': [ROOF, GROUND, LEVEL_1, EMPTY],
};

const TWO_BUILDINGS = {
  root: [PROJECT],
  'key-project': [BUILDING, ANNEX],
  'key-building': [ROOF, GROUND, LEVEL_1],
  'key-annex': [ANNEX_LOW, ANNEX_LEVEL_1],
};

const STOREY_ELEMENT_HEIGHTS: Record<string, number[]> = {
  Roof: [30, 31, 90],
  Ground: [1, 2, 3],
  'Level 1': [11, 12, 13],
  Basement: [-3],
};

let tree: Record<string, ReturnType<typeof node>[]>;
let server: FakeElementServer;
let viewer: FakeBimViewer;
let tileset: ReturnType<typeof fakeBimTileset>;

function storeyRows(storey: string) {
  return (STOREY_ELEMENT_HEIGHTS[storey] ?? []).map((height, index) => ({
    id: `${storey}-${index}`,
    label: null,
    ifcClass: 'IfcWall',
    storey,
    location: { center: { longitude: -71, latitude: 42, height }, radius: 2 },
  }));
}

function answerModel({ url, path }: ElementServerRequest) {
  if (path.endsWith('/tree/children')) {
    return { body: { nodes: tree[url.searchParams.get('nodeKey') ?? 'root'] ?? [] } };
  }
  if (path === ELEMENTS_PATH) {
    const filter = JSON.parse(url.searchParams.get('filter') ?? '{}');
    if (filter['@classFullName'] === 'IfcBuildingStorey') return { body: { items: [], total: 1 } };
    const items = [
      ...storeyRows(filter['@storey']),
      { id: `${filter['@storey']}-space`, label: null, ifcClass: 'IfcSpace', storey: filter['@storey'] },
    ];
    return { body: { items, total: items.length } };
  }
  const id = path.split('/').pop() ?? '';
  const storey = Object.values(tree).flat().find((known) => known.id === id);
  return {
    body: { id, label: storey?.label, ifcClass: 'IfcBuildingStorey', storey: storey?.label, parentId: 'x', properties: {} },
  };
}

function storeyFiltersSent(): unknown[] {
  return server
    .requestsTo(ELEMENTS_PATH)
    .map((request) => JSON.parse(request.url.searchParams.get('filter') ?? '{}'))
    .filter((filter) => !filter['@classFullName']);
}

function isolatedIds(): string[] {
  return [...(useElementStore.getState().isolated ?? [])].sort();
}

function feature(id: string): Cesium3DTileFeature {
  return fakeTileFeature({ asset_id: id }) as unknown as Cesium3DTileFeature;
}

beforeEach(() => {
  tree = ONE_BUILDING;
  server = new FakeElementServer();
  server.answer = answerModel;
  server.install();
  viewer = fakeBimViewer();
  tileset = fakeBimTileset();
  useBimModeStore.setState(BIM_MODE_OFF);
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
  useTiles3dLayerStore.setState({ layers: [LAYER], loaded: { a1b2: asTileset(tileset) } });
  setActiveCesiumViewer(asViewer(viewer));
});

afterEach(() => {
  leaveBimMode();
  server.restore();
  setActiveCesiumViewer(null);
});

describe('bim.enter', () => {
  it('applies the settings, opens the model and answers with storeys read through the tree', async () => {
    const result = await runAction('bim.enter', {});

    expect(viewer.camera.frustum.near).toBe(0.1);
    expect(useElementStore.getState().model?.layerId).toBe('a1b2');
    expect(findAction('bim.enter')?.reads).toBe(true);
    expect(result.text).toBe(
      'BIM mode is on for tower.ifc with orbit navigation. Its storeys are: Roof, Ground, Level 1, Empty.',
    );
    expect(server.requestsTo('/v1/assets/a1b2/tree/children').map((request) => request.url.searchParams.get('nodeKey'))).toEqual([
      null,
      'key-project',
      'key-building',
    ]);
  });

  it('takes walk, and a second call changes the navigation without losing the settings', async () => {
    const before = viewerSettings(viewer, tileset);
    await runAction('bim.enter', { navigation: 'walk' });
    expect(viewer.scene.screenSpaceCameraController.enableRotate).toBe(false);

    const result = await runAction('bim.enter', { navigation: 'orbit' });

    expect(viewer.scene.screenSpaceCameraController.enableRotate).toBe(true);
    expect(result.text).toContain('with orbit navigation');
    await runAction('bim.leave', {});
    expect(viewerSettings(viewer, tileset)).toEqual(before);
  });

  it('refuses a navigation it does not know, no globe, a model still loading and a 2D scene', async () => {
    await expect(runAction('bim.enter', { navigation: 'fly' })).rejects.toThrow('navigation must be one of orbit, walk');

    viewer.scene.mode = SceneMode.SCENE2D;
    await expect(runAction('bim.enter', {})).rejects.toThrow('BIM mode needs the 3D view of the globe.');

    useTiles3dLayerStore.setState({ loaded: {} });
    await expect(runAction('bim.enter', {})).rejects.toThrow('tower.ifc has not finished loading');

    setActiveCesiumViewer(null);
    await expect(runAction('bim.enter', {})).rejects.toThrow(NO_CESIUM_GLOBE);
    expect(useBimModeStore.getState().session).toBeNull();
  });

  it('says why there is no storey list when signed out, with the mode on', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });

    const result = await runAction('bim.enter', {});

    expect(result.text).toContain('Its storeys could not be listed: Sign in');
    expect(useBimModeStore.getState().session).not.toBeNull();
  });

  it('says a foreign model has no storeys, asking the server nothing', async () => {
    const foreign = { ...LAYER, url: 'https://elsewhere.example/tileset.json' };
    useTiles3dLayerStore.setState({ layers: [foreign] });

    const result = await runAction('bim.enter', {});

    expect(result.text).toContain('tower.ifc is not a tiletopia asset, so it has no storeys to choose from.');
    expect(server.requests).toEqual([]);
  });
});

describe('bim.leave', () => {
  it('restores the settings', async () => {
    const before = viewerSettings(viewer, tileset);
    await runAction('bim.enter', {});

    const result = await runAction('bim.leave', {});

    expect(viewerSettings(viewer, tileset)).toEqual(before);
    expect(result.text).toBe('BIM mode is off for tower.ifc, and its camera settings are back as they were.');
  });

  it('refuses when the mode is off', async () => {
    await expect(runAction('bim.leave', {})).rejects.toThrow('BIM mode is off, so there is nothing to leave');
  });

  it('gives back the isolation that was in place before a storey view', async () => {
    useElementStore.getState().openModel(LAYER);
    useElementStore.getState().isolateElements(['chosen-door']);
    await runAction('bim.enter', {});
    await runAction('bim.show_storey', { storey: 'Ground' });
    expect(isolatedIds()).not.toContain('chosen-door');

    await runAction('bim.leave', {});

    expect(isolatedIds()).toEqual(['chosen-door']);
  });

  it('leaves an isolation made after the storey view alone', async () => {
    await runAction('bim.enter', {});
    await runAction('bim.show_storey', { storey: 'Ground' });
    useElementStore.getState().isolateElements(['later-choice']);

    await runAction('bim.leave', {});

    expect(isolatedIds()).toEqual(['later-choice']);
  });
});

describe('bim.show_storey', () => {
  beforeEach(async () => {
    await runAction('bim.enter', {});
  });

  it('sends the storey filter and isolates only meshed elements', async () => {
    const result = await runAction('bim.show_storey', { storey: 'Level 1' });

    expect(storeyFiltersSent()).toEqual([{ '@storey': 'Level 1' }]);
    expect(isolatedIds()).toEqual(['Level 1-0', 'Level 1-1', 'Level 1-2']);
    expect(result.text).toBe('Showing only Level 1 of tower.ifc, 3 elements.');
  });

  it('reaches every fragment through the element style, in any tile', async () => {
    renderHook(() => useElementStyleCesium());

    await act(async () => {
      await runAction('bim.show_storey', { storey: 'Level 1' });
    });

    const show = tileset.style as unknown as { show: { evaluate: (feature: Cesium3DTileFeature) => boolean } };
    const inOneTile = feature('Level 1-0');
    const inAnotherTile = feature('Level 1-0');
    expect(show.show.evaluate(inOneTile)).toBe(true);
    expect(show.show.evaluate(inAnotherTile)).toBe(true);
    expect(show.show.evaluate(feature('Roof-0'))).toBe(false);
  });

  it('picks storeys below by element height, not file order, and says where the order comes from', async () => {
    const result = await runAction('bim.show_storey', { storey: 'Level 1', scope: 'and_below' });

    expect(isolatedIds()).toEqual(['Ground-0', 'Ground-1', 'Ground-2', 'Level 1-0', 'Level 1-1', 'Level 1-2']);
    expect(result.text).toContain('2 storeys and 6 elements');
    expect(result.text).toContain("The order comes from the middle height of each storey's elements.");
  });

  it('reads each storey once across choices', async () => {
    await runAction('bim.show_storey', { storey: 'Level 1', scope: 'and_below' });
    const requestsAfterFirst = server.requests.length;

    await runAction('bim.show_storey', { storey: 'Ground' });

    expect(server.requests).toHaveLength(requestsAfterFirst);
    expect(isolatedIds()).toEqual(['Ground-0', 'Ground-1', 'Ground-2']);
  });

  it('shows the whole model again on clear', async () => {
    await runAction('bim.show_storey', { storey: 'Ground' });

    const result = await runAction('bim.show_storey', { clear: true });

    expect(useElementStore.getState().isolated).toBeNull();
    expect(result.text).toBe('All of tower.ifc is showing again.');
  });

  it('refuses a storey name it does not know, listing the real ones', async () => {
    await expect(runAction('bim.show_storey', { storey: 'Level 9' })).rejects.toThrow(
      'no storey is called Level 9. The storeys are: Roof (roof), Ground (ground), Level 1 (level-1), Empty (empty)',
    );
    expect(useElementStore.getState().isolated).toBeNull();
  });

  it('refuses a storey with no mesh, changing nothing, in both scopes', async () => {
    await expect(runAction('bim.show_storey', { storey: 'Empty' })).rejects.toThrow(
      'Empty has no element with a mesh, so nothing changed.',
    );
    await expect(runAction('bim.show_storey', { storey: 'Empty', scope: 'and_below' })).rejects.toThrow(
      'Empty has no element with a mesh, so nothing shows where it sits.',
    );
    expect(useElementStore.getState().isolated).toBeNull();
  });

  it('refuses a call with neither storey nor clear, and with both', async () => {
    await expect(runAction('bim.show_storey', {})).rejects.toThrow('bim.show_storey takes a storey or clear');
    await expect(runAction('bim.show_storey', { storey: 'Ground', clear: true })).rejects.toThrow(
      'clear takes no storey',
    );
  });

  it('refuses tiles with no asset_id column, sending no element request', async () => {
    tileset.root.content = { featuresLength: 2, trianglesLength: 12, hasProperty: () => false, url: 'x.glb' };

    await expect(runAction('bim.show_storey', { storey: 'Ground' })).rejects.toThrow(
      'tower.ifc has no asset_id column on its tile features',
    );
    expect(storeyFiltersSent()).toEqual([]);
  });

  it('says the column is unconfirmed while no tile has loaded', async () => {
    tileset.root.content = { featuresLength: 0, trianglesLength: 0, hasProperty: () => false };

    const result = await runAction('bim.show_storey', { storey: 'Ground' });

    expect(result.text).toContain('No tile of it has loaded yet, so its asset_id column is unconfirmed.');
  });
});

describe('bim.show_storey off and across buildings', () => {
  it('refuses while the mode is off', async () => {
    await expect(runAction('bim.show_storey', { storey: 'Ground' })).rejects.toThrow(
      'BIM mode is off, so run bim.enter first',
    );
  });

  it('names storeys by building, and keeps below inside the building', async () => {
    tree = TWO_BUILDINGS;

    const entered = await runAction('bim.enter', {});
    expect(entered.text).toContain('Tower / Level 1');
    expect(entered.text).toContain('Annex / Level 1');

    await expect(runAction('bim.show_storey', { storey: 'Level 1' })).rejects.toThrow(
      'Level 1 matches 2 storeys, so name one by its id',
    );

    await runAction('bim.show_storey', { storey: 'annex-1', scope: 'and_below' });
    expect(isolatedIds()).toEqual(expect.arrayContaining(['Basement-0']));
    expect(isolatedIds()).not.toContain('Ground-0');
  });
});
