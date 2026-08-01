import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { VectorTilesPanel } from '../../src/components/tools/VectorTilesPanel';
import { setActiveMapLibre } from '../../src/viewer/registry';

// the real decode needs a canvas, which jsdom has no backend for
vi.mock('../../src/lib/styleImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/styleImages')>()),
  decodeStyleImage: vi.fn(
    async (image: { name: string; width: number; height: number }) =>
      ({ width: image.width, height: image.height }) as ImageData,
  ),
}));

// MantineProvider reads the color scheme through matchMedia, which jsdom lacks
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Mantine's ScrollArea observes its viewport
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** Enough of a MapLibre map for the panel, with a log of what it was told to add. */
function fakeMap() {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, { id: string }>();
  const images = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    sources,
    layers,
    images,
    calls,
    isStyleLoaded: () => true,
    addSource: (id: string, spec: unknown) => sources.set(id, spec),
    addLayer: (spec: { id: string }) => {
      calls.push(`addLayer ${spec.id}`);
      layers.set(spec.id, spec);
    },
    addImage: (name: string, image: unknown) => {
      calls.push(`addImage ${name}`);
      images.set(name, image);
    },
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    hasImage: (name: string) => images.has(name),
    removeSource: (id: string) => sources.delete(id),
    removeLayer: (id: string) => layers.delete(id),
    removeImage: (name: string) => {
      calls.push(`removeImage ${name}`);
      images.delete(name);
    },
  };
}

const styleResponse = {
  source: 'ignored',
  sourceLayer: 'features',
  layers: [
    { id: 'parcels-fill', type: 'fill', paint: { 'fill-color': '#123456' } },
    { id: 'parcels-line', type: 'line', paint: { 'line-color': '#654321' } },
  ],
  losses: [{ path: 'renderer.symbol', reason: 'unsupported marker' }],
};

const styleWithImages = {
  layers: [{ id: 'icons', type: 'symbol', layout: { 'icon-image': 'pin' } }],
  images: { pin: { data_uri: 'data:image/png;base64,iVBORw0KGgo=', width: 24, height: 24 } },
  losses: [],
};

let map: ReturnType<typeof fakeMap>;

function renderPanel() {
  render(
    <MantineProvider>
      <VectorTilesPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

function addSource(name: string, datasetId?: string) {
  fireEvent.change(screen.getByPlaceholderText('Source name'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(/branches/), {
    target: { value: '/api/v1/branches/b1/tiles/{z}/{x}/{y}' },
  });
  if (datasetId) {
    fireEvent.change(screen.getByLabelText('Dataset ID'), { target: { value: datasetId } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add Source' }));
}

const status = () => screen.getByTestId('vt-status');

describe('VectorTilesPanel', () => {
  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
    map = fakeMap();
    setActiveMapLibre(map as unknown as MapLibreMap);
  });

  afterEach(() => {
    setActiveMapLibre(null);
    vi.unstubAllGlobals();
  });

  it('draws the default violet styling when no dataset id is given', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    addSource('parcels');

    await waitFor(() => expect(status()).toHaveTextContent('Added parcels'));
    expect(fetchMock).not.toHaveBeenCalled();
    const sourceId = [...map.sources.keys()][0];
    expect([...map.layers.keys()]).toEqual([`${sourceId}-fill`, `${sourceId}-line`]);
    expect(map.layers.get(`${sourceId}-fill`)).toMatchObject({
      'source-layer': 'default',
      paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.25 },
    });
  });

  it('applies the dataset style layers in response order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(styleResponse), { status: 200 })),
    );
    renderPanel();
    addSource('parcels', 'ds-7');

    await waitFor(() => expect(status()).toHaveTextContent('2 layers, 1 dropped'));
    const sourceId = [...map.sources.keys()][0];
    expect([...map.layers.keys()]).toEqual([
      `${sourceId}-parcels-fill`,
      `${sourceId}-parcels-line`,
    ]);
    expect(map.layers.get(`${sourceId}-parcels-fill`)).toMatchObject({
      source: sourceId,
      'source-layer': 'features',
      paint: { 'fill-color': '#123456' },
    });
  });

  it('takes the styled layers with it when the row is removed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(styleResponse), { status: 200 })),
    );
    renderPanel();
    addSource('parcels', 'ds-7');
    await waitFor(() => expect(map.layers.size).toBe(2));

    // the row's trash icon is the last button on the panel
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);

    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('registers the sprites at their declared size before the layers that use them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(styleWithImages), { status: 200 })),
    );
    renderPanel();
    addSource('parcels', 'ds-7');

    await waitFor(() => expect(map.layers.size).toBe(1));
    const sourceId = [...map.sources.keys()][0];
    expect(map.calls).toEqual([`addImage ${sourceId}-pin`, `addLayer ${sourceId}-icons`]);
    expect(map.images.get(`${sourceId}-pin`)).toEqual({ width: 24, height: 24 });
    expect(map.layers.get(`${sourceId}-icons`)).toMatchObject({
      layout: { 'icon-image': `${sourceId}-pin` },
    });

    // the row's trash icon is the last button on the panel
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(map.images.size).toBe(0);
    expect(map.calls).toContain(`removeImage ${sourceId}-pin`);
  });

  it('falls back to the default styling on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no style', { status: 404 })));
    renderPanel();
    addSource('parcels', 'ds-7');

    await waitFor(() => expect(status()).toHaveTextContent('Added parcels'));
    expect(status()).not.toHaveTextContent('dataset style');
    const sourceId = [...map.sources.keys()][0];
    expect([...map.layers.keys()]).toEqual([`${sourceId}-fill`, `${sourceId}-line`]);
    expect(map.layers.get(`${sourceId}-fill`)).toMatchObject({ 'source-layer': 'features' });
  });
});
