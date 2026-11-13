import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the asset API plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Cesium3DTileset: { fromUrl: vi.fn(async (url: string) => ({ tileset: url })) },
  CesiumTerrainProvider: { fromUrl: vi.fn(async (url: string) => ({ terrain: url })) },
  EllipsoidTerrainProvider: class {},
  HeadingPitchRange: class {
    heading: number;
    pitch: number;
    range: number;
    constructor(heading: number, pitch: number, range: number) {
      this.heading = heading;
      this.pitch = pitch;
      this.range = range;
    }
  },
  Math: { toRadians: (degrees: number) => degrees },
  CzmlDataSource: class {
    name: string;
    document: unknown;
    constructor(name: string) {
      this.name = name;
    }
    async load(document: unknown) {
      this.document = document;
      return this;
    }
  },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeckOverlay: vi.fn(() => null),
}));

import { CesiumTerrainProvider, CzmlDataSource, EllipsoidTerrainProvider } from 'cesium';
import { AssetsPanel } from '../../src/components/tools/AssetsPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';
import { useAuthStore } from '../../src/features/auth/store';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useOpenCzmlAssetStore } from '../../src/store/openCzmlAssets';
import { useElementStore } from '../../src/features/elements/store';

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

const POLL_MS = 3000;

interface ServerAsset {
  id: string;
  name: string;
  asset_type: string;
  status: string;
  size_bytes: number;
}

const READY: ServerAsset = {
  id: 'a1b2',
  name: 'quarry.las',
  asset_type: 'pointcloud',
  status: 'ready',
  size_bytes: 5_400_000,
};

const ORTHOPHOTO: ServerAsset = {
  id: 'c3d4',
  name: 'orthophoto.tif',
  asset_type: 'imagery',
  status: 'ready',
  size_bytes: 80_000_000,
};

const DEM: ServerAsset = {
  id: 'e5f6',
  name: 'N47E011.hgt',
  asset_type: 'terrain',
  status: 'ready',
  size_bytes: 25_934_402,
};

const SCENE: ServerAsset = {
  id: 'b9c0',
  name: 'scene.czml',
  asset_type: 'czml',
  status: 'ready',
  size_bytes: 2048,
};

class FakeXHR {
  static last: FakeXHR | null = null;
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 201;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: FormData) {
    this.body = body;
    FakeXHR.last = this;
  }
}

const fetchMock = vi.fn();

function jsonOk(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** answer each url pattern in turn, newest registration wins */
function respond(handler: (url: string, init?: RequestInit) => unknown) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => handler(url, init));
}

function fakeViewer() {
  return {
    terrainProvider: null as unknown,
    scene: { primitives: { add: vi.fn() } },
    dataSources: { add: vi.fn(async () => {}), remove: vi.fn(() => true) },
    flyTo: vi.fn(async () => {}),
    camera: { heading: 0 },
    isDestroyed: () => false,
  };
}

const renderPanel = async () => {
  const utils = render(
    <MantineProvider env="test">
      <AssetsPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return utils;
};

/** Mantine puts the progressbar role on a section inside the bar, not its root. */
function tilingPercent() {
  const bar = within(screen.getByTestId('assets-tiling-a1b2')).getByRole('progressbar');
  return bar.getAttribute('aria-valuenow');
}

function selectFile(name: string) {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input rendered');
  fireEvent.change(input, { target: { files: [new File(['point-bytes'], name)] } });
  return input;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  FakeXHR.last = null;
  globalThis.XMLHttpRequest = FakeXHR as never;
  globalThis.fetch = fetchMock as never;
  vi.mocked(getActiveCesiumViewer).mockReturnValue(null as never);
  useAppStore.setState({ renderer: 'cesium' });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  useOgcLayerStore.setState({ layers: [] });
  useOpenCzmlAssetStore.setState({ openAssets: {} });
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  respond(() => jsonOk([]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AssetsPanel', () => {
  it('asks for a sign-in and never calls the api when signed out', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });
    await renderPanel();

    expect(screen.getByTestId('assets-signin')).toHaveTextContent(
      'Sign in to browse and upload assets.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('lists assets from the api with the bearer token', async () => {
    respond(() => jsonOk([READY]));
    await renderPanel();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/tiles/v1/assets');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer jwt-token' });

    const row = screen.getByTestId('assets-row-a1b2');
    expect(row).toHaveTextContent('quarry.las');
    expect(row).toHaveTextContent('pointcloud');
    expect(row).toHaveTextContent('ready');
    expect(row).toHaveTextContent('5.4 MB');
  });

  it('posts the upload as multipart and polls the new asset until it is ready', async () => {
    await renderPanel();
    selectFile('cloud.las');

    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/tiles/v1/assets');
    expect(xhr.headers.Authorization).toBe('Bearer jwt-token');
    expect(xhr.body?.get('name')).toBe('cloud.las');
    expect(xhr.body?.get('file')).toBeInstanceOf(File);

    act(() => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    });
    expect(screen.getByTestId('assets-upload-progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    const tiling = { ...READY, name: 'cloud.las', status: 'tiling' };
    respond((url) => (url === '/tiles/v1/assets/a1b2' ? jsonOk(tiling) : jsonOk([])));
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify(tiling);
      xhr.onload?.();
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('tiling');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/assets/a1b2', {
      headers: { Authorization: 'Bearer jwt-token' },
    });

    respond(() => jsonOk({ ...READY, name: 'cloud.las' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('ready');

    // terminal status stops the poll
    const afterDone = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(afterDone);
  });

  it('shows tiling progress from the job the upload named, and stops when it is ready', async () => {
    await renderPanel();
    selectFile('cloud.las');
    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');

    const tiling = { ...READY, name: 'cloud.las', status: 'tiling' };
    respond((url) => {
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/jobs/job-7') return jsonOk({ status: 'running', progress: 0.42 });
      return jsonOk([]);
    });
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify({ ...tiling, job_id: 'job-7' });
      xhr.onload?.();
    });
    // nothing to show before the first poll: the upload response has no progress
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/jobs/job-7', {
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(tilingPercent()).toBe('42');

    // the asset endpoint knows nothing of the job, so its next answer must not
    // wipe the progress already read
    respond((url) => {
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/jobs/job-7') return jsonOk({ status: 'running', progress: 0.8 });
      return jsonOk([]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(tilingPercent()).toBe('80');

    respond(() => jsonOk({ ...READY, name: 'cloud.las' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('ready');
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();

    const afterDone = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(afterDone);
  });

  it('finds the job of an asset it only listed, and shows its progress', async () => {
    const tiling = { ...READY, status: 'tiling' };
    respond((url) => {
      if (url === '/tiles/v1/assets') return jsonOk([tiling]);
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/assets/a1b2/jobs') return jsonOk([{ id: 'job-9', progress: 0.25 }]);
      if (url === '/tiles/v1/jobs/job-9') return jsonOk({ status: 'running', progress: 0.25 });
      return jsonOk([]);
    });
    await renderPanel();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(tilingPercent()).toBe('25');

    // the job is looked up once, not on every tick
    const lookups = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/tiles/v1/assets/a1b2/jobs').length;
    expect(lookups()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(lookups()).toBe(1);
  });

  it('polls an upload with no tiling job for status alone', async () => {
    await renderPanel();
    selectFile('city.las');
    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');

    const tiling = { ...READY, name: 'city.las', status: 'tiling' };
    respond((url) => (url === '/tiles/v1/assets/a1b2' ? jsonOk(tiling) : jsonOk([])));
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify(tiling);
      xhr.onload?.();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain('/tiles/v1/jobs/null');
  });

  it('adds a tiled asset as a layer, and flies to it once it is drawn', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([READY]));
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add quarry.las to globe' }));
    });

    expect(useTiles3dLayerStore.getState().layers).toEqual([
      {
        id: 'a1b2',
        name: 'quarry.las',
        url: '/tiles/v1/assets/a1b2/tileset.json',
        visible: true,
      },
    ]);
    // the button says the layer is there, whether or not the tiles have loaded
    expect(screen.getByRole('button', { name: 'Add quarry.las to globe' })).toBeDisabled();
    expect(viewer.flyTo).not.toHaveBeenCalled();

    const tileset = { boundingSphere: { radius: 10 } };
    await act(async () => {
      useTiles3dLayerStore.getState().setLoaded('a1b2', tileset as never);
    });
    // three radii back keeps the camera outside the model, where one radius put it inside a building
    expect(viewer.flyTo).toHaveBeenCalledWith(tileset, {
      offset: expect.objectContaining({ heading: 0, range: 30 }),
    });
  });

  it('adds a ready imagery asset as one tile layer both renderers draw', async () => {
    respond(() => jsonOk([ORTHOPHOTO]));
    await renderPanel();

    expect(
      screen.queryByRole('button', { name: 'Add orthophoto.tif to globe' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add orthophoto.tif as a map layer' }));
    });

    expect(useOgcLayerStore.getState().layers).toEqual([
      {
        id: expect.any(String),
        name: 'orthophoto.tif',
        type: 'xyz',
        url: '/tiles/v1/assets/c3d4/imagery/{z}/{x}/{y}.png',
      },
    ]);
    expect(
      screen.getByRole('button', { name: 'Add orthophoto.tif as a map layer' }),
    ).toBeDisabled();
  });

  it('sets a ready DEM asset as the globe terrain from the bundle its job wrote', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([DEM, { ...DEM, id: 'f7a8', name: 'tiling.hgt', status: 'tiling' }]));
    await renderPanel();

    expect(screen.getByRole('button', { name: 'Use tiling.hgt as globe terrain' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use N47E011.hgt as globe terrain' }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/terrain/bundles/e5f6/layer.json', {
      cache: 'no-cache',
    });
    expect(CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith('/tiles/v1/terrain/bundles/e5f6/');
    expect(viewer.terrainProvider).toEqual({ terrain: '/tiles/v1/terrain/bundles/e5f6/' });
    expect(useTiles3dLayerStore.getState().layers).toEqual([]);
  });

  it('shows why a DEM asset did not load as terrain', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond((url) =>
      url.endsWith('/layer.json') ? new Response(null, { status: 404 }) : jsonOk([DEM]),
    );
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use N47E011.hgt as globe terrain' }));
    });

    expect(await screen.findByTestId('assets-error')).toHaveTextContent(
      /^terrain e5f6 did not load: \/tiles\/v1\/terrain\/bundles\/e5f6\/layer\.json answered HTTP 404$/,
    );
    expect(CesiumTerrainProvider.fromUrl).not.toHaveBeenCalled();
    expect(viewer.terrainProvider).toBeNull();
  });

  describe('placement step', () => {
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const uploadFile = () => fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
    const sentFields = () => Object.fromEntries(
      [...(FakeXHR.last?.body?.entries() ?? [])].filter(([name]) => name !== 'file' && name !== 'name'),
    );
    const WORLD_FILE = '0.5\n0\n0\n-0.5\n10.25\n50.25';

    it.each(['.gltf', '.glb', '.obj', '.fbx', '.dae', '.ifc', '.jpg', '.jpeg', '.png'])(
      'offers %s in the upload picker',
      async (extension) => {
        await renderPanel();

        const accept = document.querySelector('input[type="file"]')?.getAttribute('accept');
        expect(accept?.split(',')).toContain(extension);
      },
    );

    it.each(['gltf', 'glb', 'obj', 'fbx', 'dae'])(
      'sends a .%s only with the longitude and latitude given',
      async (extension) => {
        await renderPanel();
        selectFile(`city.${extension}`);
        expect(FakeXHR.last).toBeNull();

        fill('Longitude', '7.42');
        fill('Latitude', '43.73');
        uploadFile();

        expect(sentFields()).toEqual({ longitude: '7.42', latitude: '43.73' });
        expect(FakeXHR.last?.body?.get('file')).toHaveProperty('name', `city.${extension}`);
        expect(screen.queryByTestId('assets-placement')).not.toBeInTheDocument();
      },
    );

    it.each([
      ['', '', 'Longitude must be'],
      ['7.42', '', 'Latitude must be'],
      ['', '43.73', 'Longitude must be'],
      ['181', '43.73', 'Longitude must be'],
      ['7.42', '91', 'Latitude must be'],
      ['east', '43.73', 'Longitude must be'],
      ['0x10', '43.73', 'Longitude must be'],
    ])('holds back a model at longitude "%s", latitude "%s"', async (longitude, latitude, problem) => {
      await renderPanel();
      selectFile('city.glb');

      fill('Longitude', longitude);
      fill('Latitude', latitude);
      uploadFile();

      expect(FakeXHR.last).toBeNull();
      expect(screen.getByTestId('assets-placement-error')).toHaveTextContent(problem);
    });

    it('sends an .ifc with no placement, for a file that names its site', async () => {
      await renderPanel();
      selectFile('plant.ifc');

      uploadFile();

      expect(sentFields()).toEqual({});
      expect(FakeXHR.last?.body?.get('ids')).toBeNull();
      expect(FakeXHR.last?.body?.get('file')).toHaveProperty('name', 'plant.ifc');
    });

    it.each(['gltf', 'glb', 'obj', 'fbx', 'dae'])('offers no IDS file for a .%s, which tiletopia never checks', async (extension) => {
      await renderPanel();
      selectFile(`city.${extension}`);

      expect(screen.getByTestId('assets-placement')).toBeInTheDocument();
      expect(screen.queryByTestId('assets-ids-file')).not.toBeInTheDocument();
    });

    it.each(['ifc', 'ifczip'])('offers an IDS file for an .%s', async (extension) => {
      await renderPanel();
      selectFile(`plant.${extension}`);

      expect(screen.getByTestId('assets-ids-file')).toBeInTheDocument();
    });

    it('sends an attached IDS file as ids', async () => {
      await renderPanel();
      selectFile('plant.ifc');

      const idsInput = document.querySelector('input[type="file"][accept=".ids"]');
      if (!(idsInput instanceof HTMLInputElement)) throw new Error('no IDS file input');
      fireEvent.change(idsInput, { target: { files: [new File(['<ids/>'], 'walls.ids')] } });
      uploadFile();

      expect(FakeXHR.last?.body?.get('ids')).toHaveProperty('name', 'walls.ids');
      expect(FakeXHR.last?.body?.get('file')).toHaveProperty('name', 'plant.ifc');
      expect(FakeXHR.last?.body?.get('longitude')).toBeNull();
    });

    it('sends the longitude and latitude given for an .ifc', async () => {
      await renderPanel();
      selectFile('plant.ifc');

      fill('Longitude', '7.42');
      fill('Latitude', '43.73');
      uploadFile();

      expect(sentFields()).toEqual({ longitude: '7.42', latitude: '43.73' });
    });

    it.each(['jpg', 'jpeg', 'png'])('sends a .%s with bounds and a crs', async (extension) => {
      await renderPanel();
      selectFile(`map.${extension}`);
      expect(FakeXHR.last).toBeNull();

      fill('Bounds', '10,50,11,51');
      fill('CRS', 'EPSG:4326');
      uploadFile();

      expect(sentFields()).toEqual({ bounds: '10,50,11,51', crs: 'EPSG:4326' });
    });

    it('sends a world file as world_file', async () => {
      await renderPanel();
      selectFile('map.png');

      fill('World file', WORLD_FILE);
      fill('CRS', '32632');
      uploadFile();

      expect(sentFields()).toEqual({ world_file: WORLD_FILE, crs: '32632' });
    });

    it.each([
      ['', '', 'EPSG:4326', 'needs bounds or a world file'],
      ['10,50,11,51', '', '', 'CRS must be'],
      ['10,50,11,51', '', 'WGS84', 'CRS must be'],
      ['10,50,11,51', WORLD_FILE, 'EPSG:4326', 'give one of them'],
      ['11,50,10,51', '', 'EPSG:4326', 'Bounds must be'],
      ['10,50,11', '', 'EPSG:4326', 'Bounds must be'],
      ['', '1\n0\n0\n-1', 'EPSG:4326', 'must be 6 lines'],
      ['', '1\n0.1\n0\n-1\n0\n0', 'EPSG:4326', 'rotated'],
      ['', '1\n0\n0\n1\n0\n0', 'EPSG:4326', 'negative y'],
    ])('holds back an image at bounds "%s", world file "%s", crs "%s"', async (bounds, worldFile, crs, problem) => {
      await renderPanel();
      selectFile('map.png');

      fill('Bounds', bounds);
      fill('World file', worldFile);
      fill('CRS', crs);
      uploadFile();

      expect(FakeXHR.last).toBeNull();
      expect(screen.getByTestId('assets-placement-error')).toHaveTextContent(problem);
    });

    it.each(['jp2', 'j2k'])('sends a .%s with no placement, for a file with its own boxes', async (extension) => {
      await renderPanel();
      selectFile(`scan.${extension}`);

      uploadFile();

      expect(sentFields()).toEqual({});
      expect(FakeXHR.last?.body?.get('file')).toHaveProperty('name', `scan.${extension}`);
    });

    it('sends the bounds given for a .jp2 with no boxes', async () => {
      await renderPanel();
      selectFile('scan.jp2');

      fill('Bounds', '10,50,11,51');
      fill('CRS', 'EPSG:4326');
      uploadFile();

      expect(sentFields()).toEqual({ bounds: '10,50,11,51', crs: 'EPSG:4326' });
    });

    it('holds back a .jp2 with bounds and no crs', async () => {
      await renderPanel();
      selectFile('scan.jp2');

      fill('Bounds', '10,50,11,51');
      uploadFile();

      expect(FakeXHR.last).toBeNull();
      expect(screen.getByTestId('assets-placement-error')).toHaveTextContent('CRS must be');
    });

    it('cancels a placement without uploading', async () => {
      await renderPanel();
      selectFile('city.glb');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByTestId('assets-placement')).not.toBeInTheDocument();
      expect(FakeXHR.last).toBeNull();
    });
  });

  it('accepts a .czml file in the upload picker', async () => {
    await renderPanel();

    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      expect.stringContaining('.czml'),
    );
  });

  it('accepts a .ifczip file in the upload picker', async () => {
    await renderPanel();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      expect.stringContaining('.ifczip'),
    );
  });

  describe('a ready IFC asset', () => {
    const IFC: ServerAsset = {
      id: 'f1a2',
      name: 'tower.ifc',
      asset_type: 'model',
      status: 'ready',
      size_bytes: 12_000_000,
    };
    const LOST = '3 IFC elements lost geometry, first reasons: bad profile';
    const JOBS_URL = '/tiles/v1/assets/f1a2/jobs';

    const jobRequests = () => fetchMock.mock.calls.filter((call) => call[0] === JOBS_URL);

    it('makes no job request for listing, however many IFC rows there are', async () => {
      const others = [2, 3, 4].map((n) => ({ ...IFC, id: `f1a${n}`, name: `tower${n}.ifc` }));
      respond(() => jsonOk([IFC, ...others]));
      await renderPanel();
      await act(async () => {});

      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/tiles/v1/assets']);
      expect(screen.queryByTestId('assets-tiling-warning-f1a2')).not.toBeInTheDocument();
    });

    it('shows what its finished job lost as a warning when the report is opened', async () => {
      respond((url) => {
        if (url === JOBS_URL) return jsonOk([{ id: 'job-1', status: 'done', error: LOST }]);
        return jsonOk([IFC]);
      });
      await renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Tiling report of tower.ifc' }));

      expect(await screen.findByTestId('assets-tiling-warning-f1a2')).toHaveTextContent(LOST);
      expect(screen.queryByTestId('assets-tiling-error-f1a2')).not.toBeInTheDocument();
      expect(screen.getByTestId('assets-row-f1a2')).toHaveTextContent('ready');
      expect(jobRequests()).toHaveLength(1);
    });

    it('says nothing was lost when the job has no error text', async () => {
      respond((url) => (url === JOBS_URL ? jsonOk([{ id: 'job-1', error: null }]) : jsonOk([IFC])));
      await renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Tiling report of tower.ifc' }));

      expect(await screen.findByTestId('assets-tiling-clean-f1a2')).toBeInTheDocument();
      expect(screen.queryByTestId('assets-tiling-warning-f1a2')).not.toBeInTheDocument();
    });

    it('says when the report could not be read, rather than that nothing was lost', async () => {
      respond((url) => (url === JOBS_URL ? jsonOk({}, 500) : jsonOk([IFC])));
      await renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Tiling report of tower.ifc' }));

      expect(await screen.findByTestId('assets-error')).toHaveTextContent('could not be read (HTTP 500)');
      expect(screen.queryByTestId('assets-tiling-clean-f1a2')).not.toBeInTheDocument();
    });

    it('makes no job request when polling finds an upload ready', async () => {
      await renderPanel();
      selectFile('tower.ifc');
      fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
      const xhr = FakeXHR.last;
      if (!xhr) throw new Error('no upload started');
      respond((url) => (url === '/tiles/v1/assets/f1a2' ? jsonOk(IFC) : jsonOk([])));
      await act(async () => {
        xhr.status = 201;
        xhr.responseText = JSON.stringify({ ...IFC, status: 'tiling', job_id: 'job-1' });
        xhr.onload?.();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(screen.getByTestId('assets-row-f1a2')).toHaveTextContent('ready');
      expect(jobRequests()).toEqual([]);
    });

    it('offers no tiling report on an asset that is not IFC', async () => {
      respond(() => jsonOk([READY]));
      await renderPanel();

      expect(screen.queryByRole('button', { name: /^Tiling report of/ })).not.toBeInTheDocument();
    });

    it('opens its elements, adding it to the globe first', async () => {
      vi.mocked(getActiveCesiumViewer).mockReturnValue(fakeViewer() as never);
      useElementStore.setState({ model: null });
      useAppStore.setState({ activePanel: 'assets' });
      respond((url) => (url === JOBS_URL ? jsonOk([]) : jsonOk([IFC])));
      await renderPanel();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Elements of tower.ifc' }));
      });

      expect(useTiles3dLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['f1a2']);
      expect(useElementStore.getState().model?.assetId).toBe('f1a2');
      expect(useAppStore.getState().activePanel).toBe('modelElements');
    });

    it('offers no elements for an asset still tiling or for a model that is not IFC', async () => {
      respond(() =>
        jsonOk([
          { ...IFC, status: 'tiling' },
          { ...READY, id: 'g3b4', name: 'tower.glb', asset_type: 'model' },
        ]),
      );
      await renderPanel();

      expect(screen.queryByRole('button', { name: /^Elements of/ })).not.toBeInTheDocument();
    });
  });

  it.each(['.jp2', '.j2k'])('accepts a %s file in the upload picker', async (extension) => {
    await renderPanel();

    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      expect.stringContaining(extension),
    );
  });

  describe('photo sets', () => {
    const PHOTO_SET: ServerAsset = {
      id: 'd7e8',
      name: 'survey.zip',
      asset_type: 'model',
      status: 'tiling',
      size_bytes: 900_000_000,
    };
    const PRESETS = {
      presets: [
        { name: 'fast', odm_options: [{ name: 'pc-quality', value: 'low' }] },
        { name: 'default', odm_options: [] },
        { name: 'high_quality', odm_options: [{ name: 'pc-quality', value: 'high' }] },
      ],
    };
    const presetsAnswer = (url: string) =>
      url === '/tiles/v1/photogrammetry/presets' ? jsonOk(PRESETS) : jsonOk([]);

    async function pickPhotoSet() {
      await renderPanel();
      await act(async () => {
        selectFile('survey.zip');
      });
    }

    function startPhotoSetUpload() {
      fireEvent.click(screen.getByRole('button', { name: 'Upload photo set' }));
      const xhr = FakeXHR.last;
      if (!xhr) throw new Error('no upload started');
      return xhr;
    }

    it('accepts a .zip file in the upload picker', async () => {
      await renderPanel();

      expect(document.querySelector('input[type="file"]')).toHaveAttribute(
        'accept',
        expect.stringContaining('.zip'),
      );
    });

    it('posts the zip with the chosen preset and polls its job through to a tileset', async () => {
      respond(presetsAnswer);
      await pickPhotoSet();
      expect(FakeXHR.last).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/photogrammetry/presets', {
        headers: { Authorization: 'Bearer jwt-token' },
      });

      fireEvent.click(screen.getByRole('textbox', { name: 'Preset' }));
      fireEvent.click(await screen.findByRole('option', { name: 'high_quality' }));
      const xhr = startPhotoSetUpload();

      expect(xhr.url).toBe('/tiles/v1/assets');
      expect(xhr.body?.get('photogrammetry_preset')).toBe('high_quality');
      expect(xhr.body?.get('file')).toHaveProperty('name', 'survey.zip');
      expect(screen.queryByTestId('assets-photo-set')).not.toBeInTheDocument();

      respond((url) => {
        if (url === '/tiles/v1/assets/d7e8') return jsonOk(PHOTO_SET);
        if (url === '/tiles/v1/jobs/job-5') return jsonOk({ status: 'running', progress: 0.4 });
        return jsonOk([]);
      });
      await act(async () => {
        xhr.status = 201;
        xhr.responseText = JSON.stringify({ ...PHOTO_SET, job_id: 'job-5' });
        xhr.onload?.();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const bar = within(screen.getByTestId('assets-tiling-d7e8')).getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '40');

      vi.mocked(getActiveCesiumViewer).mockReturnValue(fakeViewer() as never);
      respond(() => jsonOk({ ...PHOTO_SET, status: 'ready' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add survey.zip to globe' }));
      });
      expect(useTiles3dLayerStore.getState().layers[0].url).toBe(
        '/tiles/v1/assets/d7e8/tileset.json',
      );
    });

    it('sends no preset field when none is chosen, and uploads other files at once', async () => {
      respond(presetsAnswer);
      await pickPhotoSet();

      expect(startPhotoSetUpload().body?.has('photogrammetry_preset')).toBe(false);

      selectFile('cloud.las');
      expect(FakeXHR.last?.body?.get('name')).toBe('cloud.las');
      expect(FakeXHR.last?.body?.has('photogrammetry_preset')).toBe(false);
      expect(screen.queryByTestId('assets-photo-set')).not.toBeInTheDocument();
    });

    it('offers no preset list when the server does not answer with named presets', async () => {
      respond((url) =>
        url === '/tiles/v1/photogrammetry/presets'
          ? jsonOk({ presets: ['Draft', 'Medium'] })
          : jsonOk([]),
      );
      await pickPhotoSet();

      expect(screen.queryByRole('textbox', { name: 'Preset' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload photo set' })).toBeEnabled();
    });

    it('names the missing variable and offers no upload when the server has no NodeODM', async () => {
      respond((url) =>
        url === '/tiles/v1/photogrammetry/presets'
          ? jsonOk({ ...PRESETS, configured: false })
          : jsonOk([]),
      );
      await pickPhotoSet();

      expect(screen.getByTestId('assets-photo-set-refused')).toHaveTextContent(
        'TILETOPIA_NODEODM_URL',
      );
      expect(screen.queryByRole('button', { name: 'Upload photo set' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Preset' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('offers the upload when the server says NodeODM is configured', async () => {
      respond((url) =>
        url === '/tiles/v1/photogrammetry/presets'
          ? jsonOk({ ...PRESETS, configured: true })
          : jsonOk([]),
      );
      await pickPhotoSet();

      expect(screen.queryByTestId('assets-photo-set-refused')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload photo set' })).toBeEnabled();
    });

    it('cancels a picked zip without uploading it', async () => {
      respond(presetsAnswer);
      await pickPhotoSet();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByTestId('assets-photo-set')).not.toBeInTheDocument();
      expect(FakeXHR.last).toBeNull();
    });

    it('shows the 400 message of the server unchanged', async () => {
      const refusal =
        'survey.zip: TILETOPIA_NODEODM_URL is not set, so there is no NodeODM to reconstruct a photo set';
      respond(presetsAnswer);
      await pickPhotoSet();
      const xhr = startPhotoSetUpload();

      await act(async () => {
        xhr.status = 400;
        xhr.responseText = refusal;
        xhr.onload?.();
      });

      expect(screen.getByTestId('assets-error').textContent).toBe(refusal);
      expect(screen.queryByTestId('assets-row-d7e8')).not.toBeInTheDocument();
    });

    it('keeps polling a long job through a dropped connection and a 502', async () => {
      respond((url) => (url === '/tiles/v1/assets' ? jsonOk([PHOTO_SET]) : jsonOk(PHOTO_SET)));
      await renderPanel();

      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      fetchMock.mockResolvedValueOnce(jsonOk(null, 502));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.getByTestId('assets-row-d7e8')).toHaveTextContent('tiling');
      expect(screen.queryByTestId('assets-error')).not.toBeInTheDocument();

      respond(() => jsonOk({ ...PHOTO_SET, status: 'ready' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.getByTestId('assets-row-d7e8')).toHaveTextContent('ready');
    });

    it('stops polling an asset that answers 404', async () => {
      respond((url) => (url === '/tiles/v1/assets' ? jsonOk([PHOTO_SET]) : jsonOk(null, 404)));
      await renderPanel();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const afterGone = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock.mock.calls.length).toBe(afterGone);
      expect(screen.getByTestId('assets-error').textContent).toBe(
        'survey.zip stopped updating: the asset service answered HTTP 404. A 404 means it was deleted or belongs to another user.',
      );
    });

    it('says so and stops polling when the job answers 404', async () => {
      const failed = { ...PHOTO_SET, status: 'error' };
      respond((url) => {
        if (url === '/tiles/v1/assets') return jsonOk([failed]);
        if (url === '/tiles/v1/assets/d7e8') return jsonOk(failed);
        if (url === '/tiles/v1/assets/d7e8/jobs') return jsonOk([{ id: 'job-5' }]);
        return jsonOk(null, 404);
      });
      await renderPanel();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const afterGone = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock.mock.calls.length).toBe(afterGone);
      expect(screen.getByTestId('assets-error')).toHaveTextContent('HTTP 404');
    });

    it('waits for the job error the server writes after the asset status, then stops', async () => {
      const failed = { ...PHOTO_SET, status: 'error' };
      const odmError = 'ODM task failed: not enough photos\nlast console line';
      respond((url) => {
        if (url === '/tiles/v1/assets') return jsonOk([failed]);
        if (url === '/tiles/v1/assets/d7e8') return jsonOk(failed);
        if (url === '/tiles/v1/assets/d7e8/jobs') return jsonOk([{ id: 'job-5' }]);
        return jsonOk({ status: 'running', progress: 0.5, error: null });
      });
      await renderPanel();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.queryByTestId('assets-tiling-error-d7e8')).not.toBeInTheDocument();

      respond((url) => {
        if (url === '/tiles/v1/assets/d7e8') return jsonOk(failed);
        return jsonOk({ status: 'failed', progress: 0.5, error: odmError });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.getByTestId('assets-tiling-error-d7e8').textContent).toBe(odmError);

      const afterError = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });
      expect(fetchMock.mock.calls.length).toBe(afterError);
    });
  });

  it('opens a ready CZML asset as a data source, flies to it, and removes it on demand', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([SCENE]));
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add scene.czml to globe' }));
    });

    const opened = expect.objectContaining({
      name: 'scene.czml',
      document: '/tiles/v1/assets/b9c0/czml',
    });
    expect(viewer.dataSources.add).toHaveBeenCalledWith(opened);
    expect(viewer.flyTo).toHaveBeenCalledWith(opened);
    expect(useTiles3dLayerStore.getState().layers).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove scene.czml from globe' }));

    expect(viewer.dataSources.remove).toHaveBeenCalledWith(opened, true);
    expect(screen.getByRole('button', { name: 'Add scene.czml to globe' })).toBeEnabled();
  });

  it('still offers to remove an open CZML asset after the panel is closed and reopened', async () => {
    vi.mocked(getActiveCesiumViewer).mockReturnValue(fakeViewer() as never);
    respond(() => jsonOk([SCENE]));
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add scene.czml to globe' }));
    });

    cleanup();
    await renderPanel();

    expect(screen.getByRole('button', { name: 'Remove scene.czml from globe' })).toBeEnabled();
  });

  it('offers a CZML asset again on a new viewer, which does not have its data source', async () => {
    vi.mocked(getActiveCesiumViewer).mockReturnValue(fakeViewer() as never);
    respond(() => jsonOk([SCENE]));
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add scene.czml to globe' }));
    });

    cleanup();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(fakeViewer() as never);
    await renderPanel();

    expect(screen.getByRole('button', { name: 'Add scene.czml to globe' })).toBeEnabled();
  });

  it('removes an open CZML asset from the globe when the asset is deleted', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([SCENE]));
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add scene.czml to globe' }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete scene.czml' }));
    respond(() => jsonOk(null, 204));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(viewer.dataSources.remove).toHaveBeenCalledTimes(1);
    expect(useOpenCzmlAssetStore.getState().openAssets).toEqual({});
  });

  async function deleteAsset(name: string) {
    fireEvent.click(screen.getByRole('button', { name: `Delete ${name}` }));
    respond(() => jsonOk(null, 204));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
  }

  it('takes every imagery layer naming a deleted asset off the map, and no other', async () => {
    useOgcLayerStore.setState({
      layers: [
        { id: 'panel', name: 'a', type: 'xyz', url: '/tiles/v1/assets/c3d4/imagery/{z}/{x}/{y}.png' },
        {
          id: 'chat',
          name: 'b',
          type: 'xyz',
          url: 'https://viewer.example.org/tiles/v1/assets/c3d4/imagery/{z}/{x}/{y}.png',
        },
        {
          id: 'wmts',
          name: 'c',
          type: 'wmts',
          url: 'https://viewer.example.org/api/v1/assets/c3d4/imagery/{TileMatrix}/{TileCol}/{TileRow}.png',
        },
        { id: 'other', name: 'd', type: 'xyz', url: '/tiles/v1/assets/c3d45/imagery/{z}/{x}/{y}.png' },
      ],
    });
    respond(() => jsonOk([ORTHOPHOTO]));
    await renderPanel();

    await deleteAsset('orthophoto.tif');

    expect(useOgcLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['other']);
  });

  it('keeps the imagery layers of an asset whose delete the server refused', async () => {
    useOgcLayerStore.setState({
      layers: [
        { id: 'panel', name: 'a', type: 'xyz', url: '/tiles/v1/assets/c3d4/imagery/{z}/{x}/{y}.png' },
      ],
    });
    respond(() => jsonOk([ORTHOPHOTO]));
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete orthophoto.tif' }));
    respond(() => jsonOk(null, 403));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
  });

  it('takes a deleted asset\'s 3D tileset off the globe, added from the panel or from chat', async () => {
    useTiles3dLayerStore.setState({
      layers: [
        { id: 'a1b2', name: 'a', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true },
        {
          id: 'chat',
          name: 'b',
          url: 'https://viewer.example.org/tiles/v1/assets/a1b2/tileset.json',
          visible: true,
        },
        { id: 'other', name: 'c', url: '/tiles/v1/assets/ffff/tileset.json', visible: true },
      ],
    });
    respond(() => jsonOk([READY]));
    await renderPanel();

    await deleteAsset('quarry.las');

    expect(useTiles3dLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['other']);
  });

  it('puts the globe back on the ellipsoid when its terrain asset is deleted', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([DEM]));
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use N47E011.hgt as globe terrain' }));
    });
    expect(viewer.terrainProvider).toEqual({ terrain: '/tiles/v1/terrain/bundles/e5f6/' });

    await deleteAsset('N47E011.hgt');

    expect(viewer.terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
  });

  it('leaves the terrain alone when another terrain asset is deleted', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([DEM, { ...DEM, id: 'f7a8', name: 'other.hgt' }]));
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use N47E011.hgt as globe terrain' }));
    });

    await deleteAsset('other.hgt');

    expect(viewer.terrainProvider).toEqual({ terrain: '/tiles/v1/terrain/bundles/e5f6/' });
  });

  it('shows why a CZML asset did not load and adds nothing', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    vi.spyOn(CzmlDataSource.prototype, 'load').mockRejectedValueOnce(
      new Error('Request has failed. Status Code: 404\nundefined'),
    );
    respond(() => jsonOk([SCENE]));
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add scene.czml to globe' }));
    });

    expect(screen.getByTestId('assets-error')).toHaveTextContent(
      /^scene\.czml did not load: Request has failed\. Status Code: 404$/,
    );
    expect(viewer.dataSources.add).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add scene.czml to globe' })).toBeEnabled();
  });

  it('copies the WMTS and TMS URLs of a ready imagery asset, on the viewer origin', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    respond(() => jsonOk([ORTHOPHOTO]));
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Service URLs of orthophoto.tif' }));

    const imagery = `${window.location.origin}/tiles/v1/assets/c3d4/imagery`;
    const services = [
      ['WMTS capabilities', `${imagery}/wmts/1.0.0/WMTSCapabilities.xml`],
      ['TMS tile map', `${imagery}/tms/tilemapresource.xml`],
      ['TMS tiles', `${imagery}/tms/{z}/{x}/{y}.png`],
    ];
    for (const [label, url] of services) {
      expect(screen.getByLabelText(label)).toHaveValue(url);
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `Copy ${label} URL of orthophoto.tif` }),
        );
      });
      expect(writeText).toHaveBeenLastCalledWith(url);
    }
  });

  it('offers no service URLs for imagery still tiling or for another asset type', async () => {
    respond(() => jsonOk([{ ...ORTHOPHOTO, status: 'tiling' }, DEM]));
    await renderPanel();

    expect(screen.queryByRole('button', { name: /^Service URLs/ })).not.toBeInTheDocument();
  });

  it('deletes only after the confirmation step', async () => {
    respond(() => jsonOk([READY]));
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete quarry.las' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respond(() => jsonOk(null, 204));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/tiles/v1/assets/a1b2', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(screen.queryByTestId('assets-row-a1b2')).toBeNull();
  });

  it('reports an unreachable asset service', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await renderPanel();

    expect(screen.getByTestId('assets-error')).toHaveTextContent(
      'The asset service is unreachable.',
    );
  });
});
