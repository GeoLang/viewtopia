import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Cesium3DTileset, Viewer } from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import { ElementPanel } from '../../src/features/elements/ElementPanel';
import { ELEMENT_ID_LIMIT, useElementStore } from '../../src/features/elements/store';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
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
const MODEL_LAYER = { id: 'a1b2', name: 'tower.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const LOCATION = { center: { longitude: -71.061, latitude: 42.357, height: 12.5 }, radius: 4.2 };
const LOST = '3 IFC elements lost geometry, first reasons: bad profile';

function treeNode(id: string, label: string, ifcClass: string, kind: string, hasChildren: boolean) {
  return { kind, key: `key-${id}`, label, hasChildren, id, ifcClass };
}

const TREE: Record<string, ReturnType<typeof treeNode>[]> = {
  root: [treeNode('project', 'Tower', 'IfcProject', 'subject', true)],
  'key-project': [treeNode('storey', 'Level 1', 'IfcBuildingStorey', 'model', true)],
  'key-storey': [
    treeNode('wall', 'Wall 1', 'IfcWall', 'element', false),
    treeNode('door', 'Door 1', 'IfcDoor', 'element', false),
    treeNode('space', 'Room', 'IfcSpace', 'element', true),
    treeNode('bare', 'Empty room', 'IfcSpace', 'element', false),
  ],
  'key-space': [treeNode('chair', 'Chair 1', 'IfcFurniture', 'element', false)],
};

const MESHED = ['wall', 'door', 'chair'];

function listRow(id: string) {
  return {
    id,
    label: id,
    ifcClass: 'IfcWall',
    storey: 'Level 1',
    ...(MESHED.includes(id) ? { location: LOCATION } : {}),
  };
}

const WALL = {
  ...listRow('wall'),
  label: 'Wall 1',
  parentId: 'storey',
  properties: {
    'Pset_WallCommon.FireRating': { displayValue: 'REI60', value: 'REI60', units: null },
    'Qto_WallBaseQuantities.Length': { displayValue: '3000 mm', value: 3000, units: 'mm' },
    'Pset_WallCommon.IsExternal': { displayValue: 'true', value: true, units: null },
    'Element.Tag': { displayValue: 'W-101', value: 'W-101', units: null },
    'Material[0].Name': { displayValue: 'Concrete', value: 'Concrete', units: null },
  },
};

function answerList(url: URL) {
  const filter = JSON.parse(url.searchParams.get('filter') ?? '{}');
  if (filter['@id']) {
    return { body: { items: filter['@id'].$in.map(listRow), total: filter['@id'].$in.length } };
  }
  if (filter['@classFullName'] === 'IfcBuildingStorey') return { body: { items: [], total: 1 } };
  if (filter['@storey'] && !filter['@classFullName']) {
    const items = ['storey', 'wall', 'door', 'space', 'bare', 'chair'].map(listRow);
    return { body: { items, total: items.length } };
  }
  return {
    body: {
      items: [{ id: 'door', label: 'Door 1', location: LOCATION, ifcClass: 'IfcDoor', storey: 'Level 1' }],
      total: 1,
    },
  };
}

function answerModel({ url, path }: ElementServerRequest) {
  if (path === `${ASSET_PATH}/tree/children`) {
    return { body: { nodes: TREE[url.searchParams.get('nodeKey') ?? ''] ?? [] } };
  }
  if (path === `${ASSET_PATH}/tree/parents`) {
    return {
      body: {
        path: [
          { kind: 'subject', id: 'project' },
          { kind: 'model', id: 'storey' },
          { kind: 'element', id: url.searchParams.get('elementId') },
        ],
      },
    };
  }
  if (path === `${ASSET_PATH}/elements/aggregate`) {
    const values = url.searchParams.get('groupBy') === '@storey' ? ['Level 1', null] : ['IfcDoor', 'IfcWall'];
    return { body: { total: 2, aggregations: [], groups: values.map((value) => ({ value, total: 1, aggregations: [] })) } };
  }
  if (path === `${ASSET_PATH}/elements/search`) {
    return {
      body: {
        items: [{ id: 'door', location: LOCATION, properties: { className: 'IfcDoor', userLabel: 'Door 1' } }],
        total: 1,
      },
    };
  }
  if (path === `${ASSET_PATH}/elements`) return answerList(url);
  if (path === `${ASSET_PATH}/elements/wall`) return { body: WALL };
  const id = path.split('/').pop() ?? '';
  return { body: { ...listRow(id), parentId: 'project', properties: {} } };
}

const flyToBoundingSphere = vi.fn();
const jobsFetch = vi.fn();
let server: FakeElementServer;

const renderPanel = async () => {
  render(
    <MantineProvider env="test">
      <ElementPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
};

const expand = (label: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `Expand ${label}` }));
  });

async function openTreeToStoreyContents() {
  useElementStore.getState().openModel(MODEL_LAYER);
  await renderPanel();
  await screen.findByTestId('element-row-project');
  await expand('Tower');
  await screen.findByTestId('element-row-storey');
  await expand('Level 1');
  await screen.findByTestId('element-row-wall');
}

const hiddenIds = () => [...useElementStore.getState().hidden].sort();
const selectedIds = () => [...useElementStore.getState().selected].sort();

beforeEach(() => {
  server = new FakeElementServer();
  server.answer = answerModel;
  server.install();
  jobsFetch.mockReset();
  jobsFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'job-1', error: null }] });
  vi.stubGlobal('fetch', jobsFetch);
  flyToBoundingSphere.mockClear();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useAppStore.setState({ renderer: 'cesium', activeTab: 'globe', activePanel: 'modelElements' });
  useFeaturePickerStore.setState({ enabled: false, selected: null });
  useElementStore.setState({
    model: null,
    selected: new Set(),
    hidden: new Set(),
    isolated: null,
    focused: null,
  });
  useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: {} });
  setActiveCesiumViewer({
    isDestroyed: () => false,
    camera: { flyToBoundingSphere },
  } as unknown as Viewer);
});

afterEach(() => {
  server.restore();
  setActiveCesiumViewer(null);
});

describe('ElementPanel', () => {
  it('opens the one model on the globe and arms the picker, disarming it on close', async () => {
    const { unmount } = render(
      <MantineProvider env="test">
        <ElementPanel onClose={() => {}} />
      </MantineProvider>,
    );
    await act(async () => {});

    expect(useElementStore.getState().model?.assetId).toBe('a1b2');
    expect(useFeaturePickerStore.getState().enabled).toBe(true);

    unmount();
    expect(useFeaturePickerStore.getState().enabled).toBe(false);
  });

  it('loads the tree one node at a time', async () => {
    await renderPanel();

    expect(await screen.findByTestId('element-row-project')).toHaveTextContent('Tower');
    expect(screen.queryByTestId('element-row-storey')).not.toBeInTheDocument();
    expect(server.requestsTo(`${ASSET_PATH}/tree/children`)).toHaveLength(1);

    await expand('Tower');
    expect(await screen.findByTestId('element-row-storey')).toHaveTextContent('IfcBuildingStorey');
    expect(screen.queryByTestId('element-row-wall')).not.toBeInTheDocument();

    await expand('Level 1');
    expect(await screen.findByTestId('element-row-wall')).toBeInTheDocument();
    expect(server.requestsTo(`${ASSET_PATH}/tree/children`).map(({ url }) => url.searchParams.get('nodeKey'))).toEqual([
      'root',
      'key-project',
      'key-storey',
    ]);
  });

  it('selects in the scene, flies there, and groups the properties by set', async () => {
    await openTreeToStoreyContents();

    fireEvent.click(screen.getByTestId('element-row-wall'));

    await waitFor(() => expect(selectedIds()).toEqual(['wall']));
    expect(await screen.findByTestId('element-properties')).toBeInTheDocument();
    expect(flyToBoundingSphere).toHaveBeenCalledTimes(1);
    expect(flyToBoundingSphere.mock.calls[0][0].radius).toBe(LOCATION.radius);

    const common = within(await screen.findByTestId('element-property-set-Pset_WallCommon'));
    expect(common.getByText('FireRating')).toBeInTheDocument();
    expect(common.getByText('REI60')).toBeInTheDocument();
    expect(common.getByText('IsExternal')).toBeInTheDocument();
    const quantities = within(screen.getByTestId('element-property-set-Qto_WallBaseQuantities'));
    expect(quantities.getByText('3000 mm')).toBeInTheDocument();
    expect(within(screen.getByTestId('element-property-set-Element')).getByText('W-101')).toBeInTheDocument();
    expect(within(screen.getByTestId('element-property-set-Material[0]')).getByText('Concrete')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'FireRating' })).not.toBeInTheDocument();
  });

  function sessionToken(role: string): string {
    const segment = (value: object) =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment({ sub: 'element-owner', role })}.signature`;
  }

  it('saves a property edit when the token says editor', async () => {
    useAuthStore.setState({ token: sessionToken('editor'), loggedIn: true });
    jobsFetch.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/properties')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ displayValue: 'REI90', value: 'REI90', units: null }),
          text: async () => JSON.stringify({ displayValue: 'REI90', value: 'REI90', units: null }),
        };
      }
      return { ok: true, status: 200, json: async () => [{ id: 'job-1', error: null }], text: async () => '[]' };
    });
    await openTreeToStoreyContents();
    fireEvent.click(screen.getByTestId('element-row-wall'));

    const input = await screen.findByRole('textbox', { name: 'FireRating' });
    fireEvent.change(input, { target: { value: 'REI90' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(jobsFetch).toHaveBeenCalledWith(
        '/v1/assets/a1b2/elements/wall/properties',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ key: 'Pset_WallCommon.FireRating', value: 'REI90' }),
        }),
      ),
    );
    expect(input).toHaveValue('REI90');
  });

  it('shows the role refusal when a save is forbidden', async () => {
    useAuthStore.setState({ token: sessionToken('editor'), loggedIn: true });
    jobsFetch.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/properties')) {
        return { ok: false, status: 403, json: async () => null, text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => [{ id: 'job-1', error: null }], text: async () => '[]' };
    });
    await openTreeToStoreyContents();
    fireEvent.click(screen.getByTestId('element-row-wall'));

    const input = await screen.findByRole('textbox', { name: 'FireRating' });
    fireEvent.change(input, { target: { value: 'REI90' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByTestId('property-edit-error')).toHaveTextContent(
      'Your role cannot make this change. It needs the editor or admin role.',
    );
  });

  it('adds to the selection with a modifier key', async () => {
    await openTreeToStoreyContents();

    fireEvent.click(screen.getByTestId('element-row-wall'));
    await waitFor(() => expect(selectedIds()).toEqual(['wall']));
    fireEvent.click(screen.getByTestId('element-row-door'), { ctrlKey: true });

    await waitFor(() => expect(selectedIds()).toEqual(['door', 'wall']));
    await waitFor(() => expect(screen.getByTestId('element-counts')).toHaveTextContent('2 selected'));
  });

  it('opens the tree to an element picked in the scene, without flying', async () => {
    useElementStore.getState().openModel(MODEL_LAYER);
    await renderPanel();
    await screen.findByTestId('element-row-project');

    act(() => {
      useElementStore.getState().selectElement('wall', { additive: false, fromScene: true });
    });

    expect(await screen.findByTestId('element-row-wall')).toHaveAttribute('aria-pressed', 'true');
    expect(server.requestsTo(`${ASSET_PATH}/tree/parents`)[0].url.searchParams.get('elementId')).toBe('wall');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    await screen.findByTestId('element-properties');
    expect(flyToBoundingSphere).not.toHaveBeenCalled();
  });

  it('shows the message of a model with no element store', async () => {
    const message = 'This asset has no element store. Only an IFC model that finished tiling has one.';
    server.answer = () => ({ status: 404, body: { code: 'ASSET_HAS_NO_ELEMENT_STORE', message } });

    await renderPanel();

    expect(await screen.findByTestId('elements-error')).toHaveTextContent(message);
  });

  it('searches, and selects what the search found', async () => {
    useElementStore.getState().openModel(MODEL_LAYER);
    await renderPanel();
    await screen.findByTestId('element-row-project');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search elements' }), { target: { value: 'door' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByTestId('element-row-door')).toHaveTextContent('Door 1');
    expect(screen.queryByTestId('element-tree')).not.toBeInTheDocument();
    expect(server.requestsTo(`${ASSET_PATH}/elements/search`)[0].url.searchParams.get('search')).toBe('door');

    fireEvent.click(screen.getByRole('button', { name: 'Select all matches' }));
    await waitFor(() => expect(selectedIds()).toEqual(['door']));
  });

  it('filters on class and storey through the options the server grouped', async () => {
    useElementStore.getState().openModel(MODEL_LAYER);
    await renderPanel();
    await screen.findByTestId('element-row-project');
    await waitFor(() => expect(server.requestsTo(`${ASSET_PATH}/elements/aggregate`)).toHaveLength(2));

    fireEvent.click(screen.getByRole('textbox', { name: 'Class' }));
    fireEvent.click(await screen.findByRole('option', { name: 'IfcDoor' }));

    expect(await screen.findByTestId('element-row-door')).toBeInTheDocument();
    let request = server.requestsTo(`${ASSET_PATH}/elements`).at(-1);
    expect(JSON.parse(request?.url.searchParams.get('filter') ?? '')).toEqual({ '@classFullName': 'IfcDoor' });

    fireEvent.click(screen.getByRole('textbox', { name: 'Storey' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Level 1' }));

    await waitFor(() => {
      request = server.requestsTo(`${ASSET_PATH}/elements`).at(-1);
      expect(JSON.parse(request?.url.searchParams.get('filter') ?? '')).toEqual({
        '@classFullName': 'IfcDoor',
        '@storey': 'Level 1',
      });
    });
  });

  it('hides and isolates the selection, and shows everything again', async () => {
    useElementStore.getState().openModel(MODEL_LAYER);
    await renderPanel();
    await screen.findByTestId('element-row-project');
    act(() => {
      useElementStore.getState().selectElements(['wall', 'door']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Isolate' }));
    expect([...(useElementStore.getState().isolated ?? [])]).toEqual(['wall', 'door']);

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(hiddenIds()).toEqual(['door', 'wall']);
    expect(useElementStore.getState().selected.size).toBe(0);
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(useElementStore.getState().hidden.size).toBe(0);
    expect(useElementStore.getState().isolated).toBeNull();
  });

  describe('a spatial container in the tree', () => {
    it('selects and hides the contents of a storey through @storey, not the storey', async () => {
      await openTreeToStoreyContents();

      fireEvent.click(screen.getByTestId('element-row-storey'));

      await waitFor(() => expect(selectedIds()).toEqual(['chair', 'door', 'wall']));
      const filters = server
        .requestsTo(`${ASSET_PATH}/elements`)
        .map(({ url }) => JSON.parse(url.searchParams.get('filter') ?? '{}'));
      expect(filters).toContainEqual({ '@storey': 'Level 1' });
      expect(flyToBoundingSphere).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

      expect(hiddenIds()).toEqual(['chair', 'door', 'wall']);
      expect(hiddenIds()).not.toContain('storey');
    });

    it('isolates the contents of a project, walking down to its storeys', async () => {
      useElementStore.getState().openModel(MODEL_LAYER);
      await renderPanel();

      fireEvent.click(await screen.findByTestId('element-row-project'));
      await waitFor(() => expect(selectedIds()).toEqual(['chair', 'door', 'wall']));

      fireEvent.click(screen.getByRole('button', { name: 'Isolate' }));

      expect([...(useElementStore.getState().isolated ?? [])].sort()).toEqual(['chair', 'door', 'wall']);
    });

    it('selects what is inside a space, walking its children', async () => {
      await openTreeToStoreyContents();

      fireEvent.click(screen.getByTestId('element-row-space'));

      await waitFor(() => expect(selectedIds()).toEqual(['chair']));
    });

    it('keeps Hide disabled and says why when a container holds nothing with a mesh', async () => {
      await openTreeToStoreyContents();

      fireEvent.click(screen.getByTestId('element-row-bare'));

      expect(await screen.findByTestId('element-nothing-to-choose')).toHaveTextContent(
        'Empty room has no mesh and nothing with a mesh inside it',
      );
      expect(useElementStore.getState().selected.size).toBe(0);
      expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Isolate' })).toBeDisabled();
      expect(flyToBoundingSphere).not.toHaveBeenCalled();
    });

    it('refuses a container past the limit and leaves the selection alone', async () => {
      const crowded = Array.from({ length: ELEMENT_ID_LIMIT + 1 }, (_, index) =>
        treeNode(`child-${index}`, 'x', 'IfcWall', 'element', false),
      );
      server.answer = (request) =>
        request.url.searchParams.get('nodeKey') === 'key-project'
          ? { body: { nodes: crowded } }
          : answerModel(request);
      useElementStore.getState().openModel(MODEL_LAYER);
      await renderPanel();

      fireEvent.click(await screen.findByTestId('element-row-project'));

      expect(await screen.findByTestId('elements-error')).toHaveTextContent(/over the limit/);
      expect(useElementStore.getState().selected.size).toBe(0);
      expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled();
    });
  });

  it('turns off Hide and Isolate on tiles with no asset_id column, and a tree click selects nothing', async () => {
    const tileset = {
      root: { content: { featuresLength: 1, trianglesLength: 9, hasProperty: () => false }, children: [] },
    } as unknown as Cesium3DTileset;
    useTiles3dLayerStore.setState({ loaded: { a1b2: tileset } });
    useElementStore.getState().openModel(MODEL_LAYER);
    await renderPanel();
    await screen.findByTestId('element-row-project');
    act(() => {
      useElementStore.getState().selectElements(['wall']);
    });

    expect(screen.getByTestId('elements-no-id-column')).toHaveTextContent('no asset_id column');
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Isolate' })).toBeDisabled();

    act(() => {
      useElementStore.getState().clearSelection();
    });
    fireEvent.click(screen.getByTestId('element-row-project'));
    await waitFor(() => expect(useElementStore.getState().focused?.id).toBe('project'));
    expect(useElementStore.getState().selected.size).toBe(0);
  });

  it('reads the tiling warning once when it opens a model', async () => {
    jobsFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'job-1', error: LOST }] });

    await renderPanel();

    expect(await screen.findByTestId('elements-tiling-warning')).toHaveTextContent(LOST);
    expect(jobsFetch).toHaveBeenCalledTimes(1);
    expect(jobsFetch).toHaveBeenCalledWith('/tiles/v1/assets/a1b2/jobs', {
      headers: { Authorization: 'Bearer jwt-token' },
    });
  });

  it('asks a signed out viewer to sign in and sends nothing', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });

    await renderPanel();

    expect(screen.getByTestId('elements-signin')).toBeInTheDocument();
    expect(server.requests).toEqual([]);
    expect(jobsFetch).not.toHaveBeenCalled();
  });

  it('says when no asset model is on the globe', async () => {
    useTiles3dLayerStore.setState({ layers: [], loaded: {} });

    await renderPanel();

    expect(screen.getByTestId('elements-empty')).toBeInTheDocument();
  });

  it('says when the open model is not a tiletopia asset', async () => {
    useElementStore.getState().openModel({ ...MODEL_LAYER, url: 'https://elsewhere.example/tileset.json' });

    await renderPanel();

    expect(screen.getByTestId('elements-not-tiletopia')).toBeInTheDocument();
    expect(server.requests).toEqual([]);
  });
});
