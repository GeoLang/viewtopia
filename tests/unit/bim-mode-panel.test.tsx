import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BoundingSphere, Cartesian3, EdgeDisplayMode, Matrix4, Transforms } from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import { BimModeBadge } from '../../src/features/bim/BimModeBadge';
import { leaveBimMode } from '../../src/features/bim/bimMode';
import { BIM_MODE_OFF, useBimModeStore } from '../../src/features/bim/store';
import { ElementPanel } from '../../src/features/elements/ElementPanel';
import { useElementStore } from '../../src/features/elements/store';
import { readTilesetSection } from '../../src/features/scene/tilesetSection';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import {
  WITH_ELEMENT_IDS,
  asTileset,
  asViewer,
  fakeBimTileset,
  fakeBimViewer,
  glbWithJson,
  viewerSettings,
  type FakeBimViewer,
} from './stubs/fakeBimViewer';
import { FakeElementServer, type ElementServerRequest } from './stubs/fakeElementServer';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const ASSET_PATH = '/v1/assets/a1b2';
const LAYER = { id: 'a1b2', name: 'tower.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const STOREY = { kind: 'model', key: 'key-level', label: 'Level 1', hasChildren: false, id: 'level', ifcClass: 'IfcBuildingStorey' };
const LEVEL_2 = { ...STOREY, key: 'key-level-2', label: 'Level 2', id: 'level-2' };
const PLACEMENT = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));
const PROJECT = { kind: 'subject', key: 'key-project', label: 'Tower', hasChildren: true, id: 'project', ifcClass: 'IfcProject' };
const WALL = {
  id: 'wall',
  label: 'Wall',
  ifcClass: 'IfcWall',
  storey: 'Level 1',
  location: { center: { longitude: -71, latitude: 42, height: 12 }, radius: 2 },
};
const PLAIN_GLB = { meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
const EDGE_GLB = {
  meshes: [{ primitives: [{ extensions: { EXT_mesh_primitive_edge_visibility: { visibility: 3 } } }] }],
};

let server: FakeElementServer;
let viewer: FakeBimViewer;
let tileset: ReturnType<typeof fakeBimTileset>;
let tileGltf: unknown;
let tileStatus: number;
let storeyNodes: object[];

function answerModel({ url, path }: ElementServerRequest) {
  if (path === `${ASSET_PATH}/tree/children`) {
    const key = url.searchParams.get('nodeKey');
    if (key === null || key === 'root') return { body: { nodes: [PROJECT] } };
    return { body: { nodes: key === PROJECT.key ? storeyNodes : [] } };
  }
  if (path === `${ASSET_PATH}/elements/aggregate`) {
    return { body: { total: 0, aggregations: [], groups: [] } };
  }
  if (path === `${ASSET_PATH}/elements`) {
    const filter = JSON.parse(url.searchParams.get('filter') ?? '{}');
    if (filter['@classFullName']) return { body: { items: [], total: 1 } };
    return { body: { items: [WALL], total: 1 } };
  }
  return { body: { ...WALL, id: 'level', storey: 'Level 1', parentId: 'project', properties: {} } };
}

const panelFetch = vi.fn(async (url: string) => {
  if (url.endsWith('.glb')) {
    return { ok: tileStatus === 200, status: tileStatus, arrayBuffer: async () => glbWithJson(tileGltf) };
  }
  return { ok: true, status: 200, json: async () => [{ id: 'job-1', error: null }] };
});

async function renderPanel() {
  render(
    <MantineProvider env="test">
      <ElementPanel onClose={() => {}} />
      <BimModeBadge />
    </MantineProvider>,
  );
  await act(async () => {});
}

async function enterFromPanel() {
  await renderPanel();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enter BIM mode' }));
  });
}

beforeEach(() => {
  server = new FakeElementServer();
  server.answer = answerModel;
  server.install();
  panelFetch.mockClear();
  vi.stubGlobal('fetch', panelFetch);
  tileGltf = PLAIN_GLB;
  tileStatus = 200;
  storeyNodes = [STOREY];
  viewer = fakeBimViewer();
  tileset = fakeBimTileset();
  useBimModeStore.setState(BIM_MODE_OFF);
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useAppStore.setState({ renderer: 'cesium', activeTab: 'globe', activePanel: 'modelElements' });
  useFeaturePickerStore.setState({ enabled: false, selected: null });
  useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
  useTiles3dLayerStore.setState({ layers: [LAYER], loaded: { a1b2: asTileset(tileset) } });
  setActiveCesiumViewer(asViewer(viewer));
});

afterEach(() => {
  act(() => leaveBimMode());
  server.restore();
  setActiveCesiumViewer(null);
});

describe('BIM mode in the element panel', () => {
  it('enters from the panel, and both leave buttons restore the settings', async () => {
    const before = viewerSettings(viewer, tileset);
    await enterFromPanel();
    expect(viewer.camera.frustum.near).toBe(0.1);
    expect(screen.getByTestId('bim-navigation-hint')).toHaveTextContent('Double-click the model');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave BIM mode' }));
    });
    expect(viewerSettings(viewer, tileset)).toEqual(before);
    expect(screen.queryByTestId('bim-mode-badge')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enter BIM mode' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    });
    expect(viewerSettings(viewer, tileset)).toEqual(before);
  });

  it('offers no entry while the model is loading or off the Cesium globe', async () => {
    useTiles3dLayerStore.setState({ loaded: {} });
    await renderPanel();
    expect(screen.getByTestId('bim-not-loaded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enter BIM mode' })).not.toBeInTheDocument();

    act(() => useAppStore.setState({ renderer: 'maplibre' }));
    expect(screen.queryByTestId('bim-not-loaded')).not.toBeInTheDocument();
  });

  it('shows the refusal from a scene that cannot enter', async () => {
    setActiveCesiumViewer(null);

    await enterFromPanel();

    expect(screen.getByTestId('bim-enter-error')).toHaveTextContent('There is no Cesium globe on screen.');
    expect(useBimModeStore.getState().session).toBeNull();
  });

  it('switches navigation and shows what each one takes', async () => {
    await enterFromPanel();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Walk'));
    });

    expect(useBimModeStore.getState().navigation).toBe('walk');
    expect(viewer.scene.screenSpaceCameraController.enableRotate).toBe(false);
    expect(screen.getByTestId('bim-navigation-hint')).toHaveTextContent('Click a floor to stand on it.');
  });

  it('lists storeys from the tree and sends the storey filter on choosing one', async () => {
    await enterFromPanel();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Storey view' })).toBeEnabled());

    fireEvent.click(screen.getByRole('textbox', { name: 'Storey view' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Level 1' }));

    await waitFor(() => expect([...(useElementStore.getState().isolated ?? [])]).toEqual(['wall']));
    const filters = server
      .requestsTo(`${ASSET_PATH}/elements`)
      .map((request) => JSON.parse(request.url.searchParams.get('filter') ?? '{}'));
    expect(filters).toContainEqual({ '@storey': 'Level 1' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Storey view' })).toHaveValue('Level 1'));
  });

  it('stops showing the storey as chosen once Show all ends the isolation', async () => {
    await enterFromPanel();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Storey view' })).toBeEnabled());
    fireEvent.click(screen.getByRole('textbox', { name: 'Storey view' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Level 1' }));
    await waitFor(() => expect(useElementStore.getState().isolated).not.toBeNull());

    act(() => useElementStore.getState().endIsolation());

    expect(screen.getByRole('textbox', { name: 'Storey view' })).toHaveValue('');
  });

  async function showLevel1() {
    await enterFromPanel();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Storey view' })).toBeEnabled());
    fireEvent.click(screen.getByRole('textbox', { name: 'Storey view' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Level 1' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Storey view' })).toHaveValue('Level 1'));
  }

  it('offers no section at the top of a storey without an elevation, and says why', async () => {
    await showLevel1();

    expect(screen.getByTestId('bim-storey-top-note')).toHaveTextContent('Level 1 has no elevation in the model');
    expect(screen.queryByRole('button', { name: /Section at the top/ })).not.toBeInTheDocument();
  });

  it('offers no section at the top of the highest storey', async () => {
    storeyNodes = [{ ...STOREY, baseHeight: 10 }];

    await showLevel1();

    expect(screen.getByTestId('bim-storey-top-note')).toHaveTextContent('No storey with an elevation is above Level 1');
  });

  it("cuts a storey at the next storey's base height and removes the cut", async () => {
    storeyNodes = [
      { ...LEVEL_2, baseHeight: 13 },
      { ...STOREY, baseHeight: 10 },
    ];
    const sphere = new BoundingSphere(Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(5, 2, 4), new Cartesian3()), 20);
    Object.assign(tileset.root, { computedTransform: PLACEMENT, boundingSphere: sphere });
    await showLevel1();

    fireEvent.click(screen.getByRole('button', { name: 'Section at the top of Level 1' }));

    const section = readTilesetSection(asTileset(tileset));
    expect(section).toMatchObject({ axis: 'z', flip: false, enabled: true });
    expect(section?.position).toBeCloseTo(3, 6);
    expect(viewer.scene.requestRender).toHaveBeenCalled();
    expect(screen.getByTestId('bim-storey-cut')).toHaveTextContent('cut at the base of Level 2, 13.00 m above the ellipsoid');

    fireEvent.click(screen.getByRole('button', { name: 'Remove the section' }));

    expect(readTilesetSection(asTileset(tileset))?.enabled).toBe(false);
    expect(screen.queryByTestId('bim-storey-cut')).not.toBeInTheDocument();
  });

  it('shows why a foreign model has no storeys', async () => {
    const foreign = { ...LAYER, url: 'https://elsewhere.example/tileset.json' };
    useTiles3dLayerStore.setState({ layers: [foreign] });
    useElementStore.getState().openModel(foreign);

    await enterFromPanel();

    expect(await screen.findByTestId('bim-storey-error')).toHaveTextContent('tower.ifc is not a tiletopia asset');
  });
});

describe('CAD edges', () => {
  it('offers no switch for tiles with no edge data, and gives the reason', async () => {
    await enterFromPanel();

    await waitFor(() => expect(screen.getByTestId('bim-edges-note')).toHaveTextContent('no EXT_mesh_primitive_edge_visibility data'));
    expect(panelFetch).toHaveBeenCalledWith(WITH_ELEMENT_IDS.url);
    expect(screen.queryByRole('switch', { name: 'CAD edges' })).not.toBeInTheDocument();
    expect(tileset.edgeDisplayMode).toBe(EdgeDisplayMode.SURFACES_ONLY);
  });

  it('offers the switch for tiles with edge data, which sets the display mode', async () => {
    tileGltf = EDGE_GLB;
    await enterFromPanel();

    const edges = await screen.findByRole('switch', { name: 'CAD edges' });
    await act(async () => {
      fireEvent.click(edges);
    });
    expect(tileset.edgeDisplayMode).toBe(EdgeDisplayMode.SURFACES_AND_EDGES);

    await act(async () => {
      fireEvent.click(edges);
    });
    expect(tileset.edgeDisplayMode).toBe(EdgeDisplayMode.SURFACES_ONLY);
  });

  it('waits for the first tile to load before deciding', async () => {
    tileGltf = EDGE_GLB;
    tileset.root.content = { featuresLength: 0, trianglesLength: 0, hasProperty: () => false };
    await enterFromPanel();
    await waitFor(() => expect(screen.getByTestId('bim-edges-note')).toHaveTextContent('No tile has loaded yet'));
    expect(screen.queryByRole('switch', { name: 'CAD edges' })).not.toBeInTheDocument();

    tileset.root.content = WITH_ELEMENT_IDS;
    await act(async () => {
      for (const listener of [...tileset.tileLoadListeners]) listener();
    });

    expect(await screen.findByRole('switch', { name: 'CAD edges' })).toBeInTheDocument();
    expect(tileset.tileLoadListeners.size).toBe(0);
  });

  it('offers no switch when the tile cannot be read, and says why', async () => {
    tileStatus = 503;
    await enterFromPanel();

    await waitFor(() => expect(screen.getByTestId('bim-edges-note')).toHaveTextContent('answered HTTP 503'));
    expect(screen.queryByRole('switch', { name: 'CAD edges' })).not.toBeInTheDocument();
  });
});
