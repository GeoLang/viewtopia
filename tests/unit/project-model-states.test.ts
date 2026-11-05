import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import {
  applyProject,
  parseProject,
  serializeProject,
  type ViewtopiaProject,
} from '../../src/features/project/projectFile';
import type { SavedModelState } from '../../src/features/project/modelStates';
import { enterBimMode, leaveBimMode } from '../../src/features/bim/bimMode';
import { BIM_MODE_OFF, useBimModeStore } from '../../src/features/bim/store';
import { bimStoreys, findStorey, showStorey } from '../../src/features/bim/storeys';
import { useAuthStore } from '../../src/features/auth/store';
import { useElementStore } from '../../src/features/elements/store';
import {
  applyTilesetSection,
  readTilesetSection,
  setTilesetSectionOutline,
  subscribeTilesetSections,
  tilesetSectionOutlined,
} from '../../src/features/scene/tilesetSection';
import { useAppStore } from '../../src/store/app';
import { useLayerLoadErrorStore } from '../../src/store/layerLoadErrors';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import { asTileset, asViewer, fakeBimTileset, fakeBimViewer, type FakeBimViewer } from './stubs/fakeBimViewer';
import { FakeElementServer, type ElementServerAnswer, type ElementServerRequest } from './stubs/fakeElementServer';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const LAYER = { id: 'a1b2', name: 'tower.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const ANNEX = { id: 'c3d4', name: 'annex.ifc', url: '/tiles/v1/assets/c3d4/tileset.json', visible: true };
const ELEMENTS_PATH = '/v1/assets/a1b2/elements';
const LOCATION = { center: { longitude: -71, latitude: 42, height: 2 }, radius: 2 };
const GROUND_IDS = ['ground-wall-0', 'ground-wall-1'];

function node(id: string, label: string, ifcClass: string, kind: string, hasChildren: boolean) {
  return { kind, key: `key-${id}`, label, hasChildren, id, ifcClass };
}

const TREE: Record<string, ReturnType<typeof node>[]> = {
  root: [node('project', 'Project', 'IfcProject', 'subject', true)],
  'key-project': [node('building', 'Tower', 'IfcBuilding', 'subject', true)],
  'key-building': [
    node('ground', 'Ground', 'IfcBuildingStorey', 'model', false),
    node('level-1', 'Level 1', 'IfcBuildingStorey', 'model', false),
  ],
};

const SAVED: SavedModelState = {
  selected: ['wall-1'],
  hidden: ['wall-2'],
  isolated: ['wall-1', 'wall-3'],
  section: { axis: 'z', position: 3.5, flip: true, enabled: true, outlined: false },
  bimMode: { navigation: 'walk', storeyView: { storeyGlobalId: 'ground', scope: 'only' } },
};

let server: FakeElementServer;
let knownIds: string[];
let viewer: FakeBimViewer;
let tileset: ReturnType<typeof fakeBimTileset>;

function row(id: string) {
  return { id, label: null, ifcClass: 'IfcWall', storey: 'Ground', location: LOCATION };
}

function answerModel({ url, path }: ElementServerRequest): ElementServerAnswer {
  if (path.endsWith('/tree/children')) {
    return { body: { nodes: TREE[url.searchParams.get('nodeKey') ?? 'root'] ?? [] } };
  }
  if (path === ELEMENTS_PATH) {
    const filter = JSON.parse(url.searchParams.get('filter') ?? '{}');
    if (filter['@id']) {
      const asked: string[] = filter['@id'].$in;
      const items = asked.filter((id) => knownIds.includes(id)).map(row);
      return { body: { items, total: items.length } };
    }
    if (filter['@classFullName'] === 'IfcBuildingStorey') return { body: { items: [], total: 1 } };
    return { body: { items: GROUND_IDS.map(row), total: GROUND_IDS.length } };
  }
  return {
    body: { id: 'ground', label: 'Ground', ifcClass: 'IfcBuildingStorey', storey: 'Ground', parentId: 'building', properties: {} },
  };
}

function idCheckRequests(): string[][] {
  return server
    .requestsTo(ELEMENTS_PATH)
    .map((request) => JSON.parse(request.url.searchParams.get('filter') ?? '{}'))
    .filter((filter) => filter['@id'])
    .map((filter) => filter['@id'].$in);
}

const SAVED_SETS: SavedModelState = { ...SAVED, section: null, bimMode: null };

function projectWith(modelStatesByAsset: Record<string, unknown>) {
  return parseProject(JSON.stringify({ ...serializeProject('tower'), tiles3dLayers: [LAYER], modelStatesByAsset }));
}

// loadProjectMap hands applyProject the JSON stored on the server without parseProject
function serverProjectWith(modelStatesByAsset: unknown): ViewtopiaProject {
  return JSON.parse(
    JSON.stringify({ ...serializeProject('tower'), tiles3dLayers: [LAYER, ANNEX], modelStatesByAsset }),
  );
}

function untilSectionChanged(): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = subscribeTilesetSections(() => {
      unsubscribe();
      resolve();
    });
  });
}

// stands in for useTilesets3dCesium, which puts the primitive in the store once it has loaded
function finishLoadingTileset(): void {
  useTiles3dLayerStore.getState().setLoaded(LAYER.id, asTileset(tileset));
}

function untilStoreyShown(): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = useBimModeStore.subscribe((state) => {
      if (!state.storeyView) return;
      unsubscribe();
      resolve();
    });
  });
}

function nextNotificationMessage(): Promise<unknown> {
  return new Promise((resolve) => {
    vi.mocked(notifications.show).mockImplementationOnce((notification) => {
      resolve(notification.message);
      return 'notification';
    });
  });
}

function sorted(ids: Iterable<string> | null): string[] {
  return [...(ids ?? [])].sort();
}

beforeEach(() => {
  // applyProject polls for a Cesium viewer to fly with setInterval, which the fake viewer cannot do
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  knownIds = ['wall-1', 'wall-2', 'wall-3'];
  server = new FakeElementServer();
  server.answer = answerModel;
  server.install();
  viewer = fakeBimViewer();
  tileset = fakeBimTileset();
  useAppStore.setState({ renderer: 'cesium', basemap: 'liberty', customBasemap: null });
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useBimModeStore.setState(BIM_MODE_OFF);
  useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  setActiveCesiumViewer(asViewer(viewer));
});

afterEach(() => {
  leaveBimMode();
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  useLayerLoadErrorStore.setState({ errors: {} });
  server.restore();
  setActiveCesiumViewer(null);
  vi.useRealTimers();
  vi.mocked(notifications.show).mockReset();
});

describe('saving a project', () => {
  it('writes the element sets, section and BIM storey of a model under its asset id', async () => {
    useTiles3dLayerStore.setState({ layers: [LAYER], loaded: { [LAYER.id]: asTileset(tileset) } });
    const elements = useElementStore.getState();
    const model = elements.openModel(LAYER);
    elements.selectElements(['wall-1']);
    elements.hideElements(['wall-2']);
    elements.isolateElements(['wall-1', 'wall-3']);
    enterBimMode({ viewer: asViewer(viewer), tileset: asTileset(tileset), model, navigation: 'walk' });
    await showStorey(findStorey(await bimStoreys(), 'Ground'), 'only');
    const noRender = () => undefined;
    applyTilesetSection(asTileset(tileset), { axis: 'z', position: 3.5, flip: true, enabled: true }, noRender);
    setTilesetSectionOutline(asTileset(tileset), { visible: false }, noRender);

    const saved = JSON.parse(JSON.stringify(serializeProject('tower')));

    expect(saved.schemaVersion).toBe(2);
    expect(sorted(useElementStore.getState().isolated)).toEqual(GROUND_IDS);
    expect(saved.modelStatesByAsset).toEqual({ a1b2: SAVED });
  });
});

describe('opening a project', () => {
  it('restores the element sets, section and BIM storey once the tileset has loaded', async () => {
    applyProject(projectWith({ a1b2: SAVED }));
    const storeyShown = untilStoreyShown();
    finishLoadingTileset();
    await storeyShown;

    const elements = useElementStore.getState();
    expect(elements.model?.layerId).toBe(LAYER.id);
    expect(sorted(elements.selected)).toEqual(['wall-1']);
    expect(sorted(elements.hidden)).toEqual(['wall-2']);
    expect(sorted(elements.isolated)).toEqual(GROUND_IDS);
    const bim = useBimModeStore.getState();
    expect(bim.session?.tileset).toBe(asTileset(tileset));
    expect(bim.navigation).toBe('walk');
    expect(bim.storeyView?.storeyKey).toBe('key-ground');
    expect(sorted(bim.storeyView?.isolatedBefore ?? null)).toEqual(['wall-1', 'wall-3']);
    expect(readTilesetSection(asTileset(tileset))).toEqual({ axis: 'z', position: 3.5, flip: true, enabled: true });
    expect(tilesetSectionOutlined(asTileset(tileset))).toBe(false);
    expect(sorted(idCheckRequests().flat())).toEqual(['wall-1', 'wall-2', 'wall-3']);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('saves the state from the file again while its tileset is still loading', () => {
    applyProject(projectWith({ a1b2: SAVED }));

    expect(serializeProject('tower').modelStatesByAsset).toEqual({ a1b2: SAVED });
  });

  it('leaves out saved ids the server no longer has and says how many', async () => {
    knownIds = ['wall-1', 'wall-3'];
    const saved: SavedModelState = {
      selected: ['wall-1', 'gone-1'],
      hidden: ['gone-2'],
      isolated: ['wall-3'],
      section: null,
      bimMode: null,
    };
    const message = nextNotificationMessage();

    applyProject(projectWith({ a1b2: saved }));
    finishLoadingTileset();

    expect(await message).toBe(
      '2 of the 4 saved element ids of tower.ifc no longer exist in the model, so they were left out.',
    );
    const elements = useElementStore.getState();
    expect(sorted(elements.selected)).toEqual(['wall-1']);
    expect(sorted(elements.hidden)).toEqual([]);
    expect(sorted(elements.isolated)).toEqual(['wall-3']);
  });

  it('refuses a malformed entry of a server project map by model name, and restores the other model', async () => {
    const message = nextNotificationMessage();

    applyProject(serverProjectWith({ a1b2: SAVED_SETS, c3d4: { ...SAVED_SETS, selected: null } }));
    finishLoadingTileset();

    expect(await message).toBe('The saved state of annex.ifc was not restored: selected is not a list of element ids');
    const elements = useElementStore.getState();
    expect(elements.model?.layerId).toBe(LAYER.id);
    expect(sorted(elements.selected)).toEqual(['wall-1']);
    expect(sorted(elements.hidden)).toEqual(['wall-2']);
    expect(sorted(elements.isolated)).toEqual(['wall-1', 'wall-3']);
  });

  it('refuses a saved section on an unknown axis, naming the field', async () => {
    const message = nextNotificationMessage();

    applyProject(projectWith({ a1b2: { ...SAVED_SETS, section: { ...SAVED.section, axis: 'w' } } }));
    finishLoadingTileset();

    expect(await message).toBe('The saved state of tower.ifc was not restored: section.axis is not one of x, y, z');
    expect(readTilesetSection(asTileset(tileset))).toBeNull();
    expect(useElementStore.getState().model).toBeNull();
  });

  it('shows a server project map whose model states are not keyed by asset id in a notification', async () => {
    const notification = new Promise<unknown>((resolve) => {
      vi.mocked(notifications.show).mockImplementationOnce((shown) => {
        resolve(shown);
        return 'notification';
      });
    });

    applyProject(serverProjectWith([]));

    expect(await notification).toMatchObject({
      color: 'red',
      message: 'No saved model state was restored: project file: modelStatesByAsset is not an object keyed by asset id',
    });
  });

  it('ends the wait for a model whose tileset fails to load and says so, restoring the other model', async () => {
    const message = nextNotificationMessage();

    applyProject(serverProjectWith({ a1b2: SAVED_SETS, c3d4: SAVED_SETS }));
    finishLoadingTileset();
    // stands in for useTilesets3dCesium, which records a failed tileset.json under the layer id
    useLayerLoadErrorStore.getState().setError(ANNEX.id, 'Request has failed. Status Code: 404');

    expect(await message).toBe(
      'The saved state of annex.ifc was not restored: its tileset did not load: Request has failed. Status Code: 404',
    );
    expect(sorted(useElementStore.getState().selected)).toEqual(['wall-1']);
    const saved = serializeProject('tower').modelStatesByAsset ?? {};
    expect(saved.c3d4).toEqual({ selected: [], hidden: [], isolated: null, section: null, bimMode: null });
  });

  it('clears the live selection, hidden and isolated sets of the open model when the saved ones are empty', async () => {
    const elements = useElementStore.getState();
    elements.openModel(LAYER);
    elements.selectElements(['wall-1']);
    elements.hideElements(['wall-2']);
    elements.isolateElements(['wall-3']);
    const empty: SavedModelState = {
      selected: [],
      hidden: [],
      isolated: null,
      section: { axis: 'z', position: 1, flip: false, enabled: true, outlined: true },
      bimMode: null,
    };

    applyProject(projectWith({ a1b2: empty }));
    const sectionChanged = untilSectionChanged();
    finishLoadingTileset();
    await sectionChanged;

    const restored = useElementStore.getState();
    expect(restored.model?.layerId).toBe(LAYER.id);
    expect(sorted(restored.selected)).toEqual([]);
    expect(sorted(restored.hidden)).toEqual([]);
    expect(restored.isolated).toBeNull();
    expect(server.requests).toEqual([]);
  });

  it('applies nothing from a version 1 file, which has no saved model state', async () => {
    const { modelStatesByAsset: _absent, ...current } = serializeProject('older');
    const older = parseProject(JSON.stringify({ ...current, schemaVersion: 1, tiles3dLayers: [LAYER] }));
    expect(older.schemaVersion).toBe(2);
    expect(older.modelStatesByAsset).toEqual({});

    applyProject(older);
    finishLoadingTileset();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const elements = useElementStore.getState();
    expect(elements.model).toBeNull();
    expect(elements.isolated).toBeNull();
    expect(useBimModeStore.getState().session).toBeNull();
    expect(readTilesetSection(asTileset(tileset))).toBeNull();
    expect(server.requests).toEqual([]);
    expect(notifications.show).not.toHaveBeenCalled();
  });
});
