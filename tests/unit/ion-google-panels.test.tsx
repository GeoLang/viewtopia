import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactElement } from 'react';

// only the ion/google plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Cesium3DTileset: {
    fromIonAssetId: vi.fn(async (assetId: number) => ({ assetId })),
    fromUrl: vi.fn(async (url: string, options?: unknown) => ({ url, options })),
  },
  CesiumTerrainProvider: {
    fromIonAssetId: vi.fn(async (assetId: number) => ({ terrain: assetId })),
  },
  EllipsoidTerrainProvider: class {},
  Ion: { defaultAccessToken: '' },
  IonImageryProvider: {
    fromAssetId: vi.fn(async (assetId: number) => ({ imagery: assetId })),
  },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { Cesium3DTileset, Ion, IonImageryProvider } from 'cesium';
import { CesiumIonPanel } from '../../src/components/tools/CesiumIonPanel';
import { Google3DPanel } from '../../src/components/tools/Google3DPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';

// MantineProvider reads the color scheme through matchMedia, missing from jsdom
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

function fakeViewer() {
  return {
    scene: { primitives: { add: vi.fn((p: unknown) => p), remove: vi.fn(() => true) } },
    imageryLayers: {
      addImageryProvider: vi.fn((p: unknown) => ({ layer: p })),
      contains: vi.fn(() => true),
      remove: vi.fn(() => true),
    },
    flyTo: vi.fn(async () => true),
    terrainProvider: null as unknown,
    isDestroyed: () => false,
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

const useViewer = (v: FakeViewer | null) =>
  vi.mocked(getActiveCesiumViewer).mockReturnValue(v as never);

const renderPanel = (ui: ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

const ionResponse = (items: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items }) }));

const ASSETS = [
  { id: 11, name: 'Downtown Mesh', type: '3DTILES' },
  { id: 22, name: 'Aerial Imagery', type: 'IMAGERY' },
  { id: 33, name: 'Field Notes', type: 'GEOJSON' },
];

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  useViewer(null);
  useAppStore.setState({
    renderer: 'cesium',
    settings: {
      ...useAppStore.getState().settings,
      cesiumIonToken: '',
      googleMapsApiKey: '',
    },
  });
  Ion.defaultAccessToken = '';
});

async function connectIon(token: string) {
  fireEvent.change(screen.getByLabelText('Access Token'), { target: { value: token } });
  fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
}

describe('CesiumIonPanel', () => {
  it('lists the account assets returned by the ion REST API and persists the token', async () => {
    useViewer(fakeViewer());
    const fetchMock = ionResponse(ASSETS);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(<CesiumIonPanel onClose={() => {}} />);

    await connectIon('tok-abc');

    expect(await screen.findByTestId('ion-asset-11')).toHaveTextContent('Downtown Mesh');
    expect(screen.getByTestId('ion-asset-11')).toHaveTextContent('3DTILES');
    expect(screen.getByTestId('ion-asset-22')).toHaveTextContent('Aerial Imagery');
    expect(fetchMock).toHaveBeenCalledWith('https://api.cesium.com/v1/assets', {
      headers: { Authorization: 'Bearer tok-abc' },
    });
    expect(useAppStore.getState().settings.cesiumIonToken).toBe('tok-abc');
    expect(Ion.defaultAccessToken).toBe('tok-abc');
  });

  it('tolerates a response without an items array', async () => {
    useViewer(fakeViewer());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    renderPanel(<CesiumIonPanel onClose={() => {}} />);

    await connectIon('tok-abc');

    expect(await screen.findByText(/no assets found/i)).toBeInTheDocument();
  });

  it('reports a rejected token and adds nothing', async () => {
    useViewer(fakeViewer());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );
    renderPanel(<CesiumIonPanel onClose={() => {}} />);

    await connectIon('bad-token');

    expect(await screen.findByTestId('ion-error')).toHaveTextContent(/rejected that token/i);
    expect(useAppStore.getState().settings.cesiumIonToken).toBe('');
  });

  it('adds a 3D Tiles asset to the scene and removes it on demand', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', ionResponse(ASSETS));
    renderPanel(<CesiumIonPanel onClose={() => {}} />);
    await connectIon('tok-abc');
    await screen.findByTestId('ion-asset-11');

    fireEvent.click(screen.getByRole('button', { name: /add downtown mesh to scene/i }));

    const removeButton = await screen.findByRole('button', { name: /remove downtown mesh/i });
    expect(Cesium3DTileset.fromIonAssetId).toHaveBeenCalledWith(11);
    expect(viewer.scene.primitives.add).toHaveBeenCalledWith({ assetId: 11 });

    fireEvent.click(removeButton);

    expect(viewer.scene.primitives.remove).toHaveBeenCalledWith({ assetId: 11 });
    expect(
      await screen.findByRole('button', { name: /add downtown mesh to scene/i }),
    ).toBeInTheDocument();
  });

  it('adds an imagery asset as an imagery layer', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', ionResponse(ASSETS));
    renderPanel(<CesiumIonPanel onClose={() => {}} />);
    await connectIon('tok-abc');
    await screen.findByTestId('ion-asset-22');

    fireEvent.click(screen.getByRole('button', { name: /add aerial imagery to scene/i }));

    await screen.findByRole('button', { name: /remove aerial imagery/i });
    expect(IonImageryProvider.fromAssetId).toHaveBeenCalledWith(22);
    expect(viewer.imageryLayers.addImageryProvider).toHaveBeenCalledWith({ imagery: 22 });
  });

  it('offers no add action for an asset type cesium cannot attach', async () => {
    useViewer(fakeViewer());
    vi.stubGlobal('fetch', ionResponse(ASSETS));
    renderPanel(<CesiumIonPanel onClose={() => {}} />);
    await connectIon('tok-abc');
    await screen.findByTestId('ion-asset-33');

    expect(screen.getByRole('button', { name: /add field notes to scene/i })).toBeDisabled();
  });

  it('shows the renderer notice when there is no cesium viewer', () => {
    useViewer(null);
    vi.stubGlobal('fetch', vi.fn());
    renderPanel(<CesiumIonPanel onClose={() => {}} />);

    expect(screen.getByTestId('ion-no-cesium')).toHaveTextContent(
      'Cesium Ion needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
    expect(screen.queryByLabelText('Access Token')).toBeNull();
  });
});

describe('Google3DPanel', () => {
  const typeKey = (key: string) =>
    fireEvent.change(screen.getByLabelText('Google Maps API Key'), { target: { value: key } });

  it('loads the google tileset with the entered key and visible credits', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    renderPanel(<Google3DPanel onClose={() => {}} />);

    typeKey('key-xyz');
    fireEvent.click(screen.getByRole('switch'));

    await vi.waitFor(() => expect(viewer.scene.primitives.add).toHaveBeenCalled());
    const [url, options] = vi.mocked(Cesium3DTileset.fromUrl).mock.calls[0];
    expect(url).toBe('https://tile.googleapis.com/v1/3dtiles/root.json?key=key-xyz');
    expect(options).toEqual({ showCreditsOnScreen: true });
    expect(useAppStore.getState().settings.googleMapsApiKey).toBe('key-xyz');
  });

  it('removes the tileset when toggled back off', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    renderPanel(<Google3DPanel onClose={() => {}} />);

    typeKey('key-xyz');
    fireEvent.click(screen.getByRole('switch'));
    await vi.waitFor(() => expect(viewer.scene.primitives.add).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('switch'));

    expect(viewer.scene.primitives.remove).toHaveBeenCalledWith({
      url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=key-xyz',
      options: { showCreditsOnScreen: true },
    });
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('surfaces a load failure and resets the toggle', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.mocked(Cesium3DTileset.fromUrl).mockRejectedValueOnce(new Error('403 Forbidden'));
    renderPanel(<Google3DPanel onClose={() => {}} />);

    typeKey('bad-key');
    fireEvent.click(screen.getByRole('switch'));

    expect(await screen.findByTestId('google3d-error')).toHaveTextContent('403 Forbidden');
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(viewer.scene.primitives.add).not.toHaveBeenCalled();
  });

  it('shows the renderer notice when there is no cesium viewer', () => {
    useViewer(null);
    renderPanel(<Google3DPanel onClose={() => {}} />);

    expect(screen.getByTestId('google3d-no-cesium')).toHaveTextContent(
      'Google 3D Tiles needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
