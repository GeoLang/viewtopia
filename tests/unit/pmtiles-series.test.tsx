import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TimelapsePanel } from '../../src/components/tools/TimelapsePanel';
import { makeArchive, orderedArchives, parseTimeLabel } from '../../src/features/pmtiles/series';
import type { PmtilesInfo } from '../../src/features/pmtiles/source';
import { useAppStore } from '../../src/store/app';
import { setActiveMapLibre } from '../../src/viewer/registry';

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

const RASTER: PmtilesInfo = { kind: 'raster', vectorLayers: [], minZoom: 0, maxZoom: 14 };
const VECTOR: PmtilesInfo = {
  kind: 'vector',
  vectorLayers: ['roads'],
  minZoom: 0,
  maxZoom: 14,
};

vi.mock('../../src/lib/geoplumb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/geoplumb')>()),
  listLayers: vi.fn(async () => []),
}));

vi.mock('../../src/features/pmtiles/source', () => ({
  addRemotePmtiles: vi.fn(async (url: string) => (url.includes('vector') ? VECTOR : RASTER)),
  addLocalPmtiles: vi.fn(async (file: File) => ({
    url: `pmtiles://${file.name}`,
    info: RASTER,
  })),
  registerPmtilesProtocol: vi.fn(),
}));

describe('PMTiles time labels', () => {
  it('reads a date out of a file name', () => {
    expect(parseTimeLabel('landcover-2024-06-01.pmtiles')).toBe('2024-06-01');
    expect(parseTimeLabel('landcover-2024-06.pmtiles')).toBe('2024-06');
    expect(parseTimeLabel('landcover_2024.pmtiles')).toBe('2024');
  });

  it('reads it out of a URL, ignoring the rest of the path and the query', () => {
    expect(parseTimeLabel('https://tiles.example.com/2019/roads-2024-06.pmtiles?v=3')).toBe(
      '2024-06',
    );
    expect(parseTimeLabel('pmtiles://roads-2024.pmtiles')).toBe('2024');
  });

  it('keeps what it can when the month or day is not a date', () => {
    expect(parseTimeLabel('roads-2024-13-01.pmtiles')).toBe('2024');
    expect(parseTimeLabel('roads-2024-06-45.pmtiles')).toBe('2024-06');
  });

  it('finds nothing to label with when there is no date', () => {
    expect(parseTimeLabel('roads.pmtiles')).toBe('');
    expect(parseTimeLabel('roads-v20240601.pmtiles')).toBe('');
    expect(parseTimeLabel('build-123.pmtiles')).toBe('');
  });
});

describe('PMTiles series ordering', () => {
  const archive = (name: string) => makeArchive(name, `pmtiles://${name}`, RASTER);

  it('runs oldest first whatever order they were added in', () => {
    const series = orderedArchives([
      archive('roads-2024-06.pmtiles'),
      archive('roads-2019.pmtiles'),
      archive('roads-2024-01-15.pmtiles'),
    ]);
    expect(series.map((a) => a.timeLabel)).toEqual(['2019', '2024-01-15', '2024-06']);
  });

  it('leaves the unlabelled ones at the end in the order they were added', () => {
    const first = archive('roads.pmtiles');
    const second = archive('rivers.pmtiles');
    const series = orderedArchives([first, second, archive('roads-2001.pmtiles')]);
    expect(series.map((a) => a.name)).toEqual([
      'roads-2001.pmtiles',
      'roads.pmtiles',
      'rivers.pmtiles',
    ]);
    expect(second.timeLabel).toBe('');
  });
});

/** Enough of a MapLibre map to add PMTiles sources and layers to. */
function fakeMap() {
  const sources = new Map<string, { url?: string }>();
  const layers = new Map<string, { id: string }>();
  return {
    isStyleLoaded: () => true,
    addSource: (id: string, spec: { url?: string }) => sources.set(id, spec),
    addLayer: (spec: { id: string }) => layers.set(spec.id, spec),
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    removeSource: (id: string) => sources.delete(id),
    removeLayer: (id: string) => layers.delete(id),
    getStyle: () => ({ layers: [...layers.values()], sources: Object.fromEntries(sources) }),
    setPaintProperty: () => {},
    isSourceLoaded: () => true,
    on: () => {},
    off: () => {},
    once: () => {},
    layerIds: () => [...layers.keys()],
  };
}

let active: ReturnType<typeof fakeMap>;

const SERIES_SOURCE = 'timelapse-pmtiles';
const seriesUrl = () => active.getSource(SERIES_SOURCE)?.url;

async function panel() {
  const view = render(
    <MantineProvider>
      <TimelapsePanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return view;
}

function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

async function addArchive(url: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Archive URL' }), {
    target: { value: url },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await act(async () => {});
}

beforeEach(() => {
  active = fakeMap();
  setActiveMapLibre(active as unknown as MapLibreMap);
  useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
});

afterEach(() => {
  cleanup();
  setActiveMapLibre(null);
});

describe('TimelapsePanel PMTiles series', () => {
  it('draws the oldest archive and steps to the next one', async () => {
    await panel();
    pick('Source', 'PMTiles series');

    await addArchive('https://example.com/roads-2024-06.pmtiles');
    expect(seriesUrl()).toBe('pmtiles://https://example.com/roads-2024-06.pmtiles');

    await addArchive('https://example.com/roads-2023-06.pmtiles');
    expect(seriesUrl()).toBe('pmtiles://https://example.com/roads-2023-06.pmtiles');
    expect(screen.getByTestId('pmtiles-series-step')).toHaveTextContent('Step 1 of 2: 2023-06');

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Series step' }), { key: 'ArrowRight' });
    expect(seriesUrl()).toBe('pmtiles://https://example.com/roads-2024-06.pmtiles');
    expect(screen.getByTestId('pmtiles-series-step')).toHaveTextContent('Step 2 of 2: 2024-06');
  });

  it('styles a vector archive from its probed source layers, and cleans it off on the swap', async () => {
    await panel();
    pick('Source', 'PMTiles series');

    await addArchive('https://example.com/vector-2021.pmtiles');
    expect(active.layerIds()).toEqual([
      `${SERIES_SOURCE}-roads-fill`,
      `${SERIES_SOURCE}-roads-line`,
      `${SERIES_SOURCE}-roads-circle`,
    ]);

    await addArchive('https://example.com/roads-2022.pmtiles');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Series step' }), { key: 'ArrowRight' });
    expect(active.layerIds()).toEqual([`${SERIES_SOURCE}-raster`]);
  });

  it('reorders on a hand-typed time label', async () => {
    await panel();
    pick('Source', 'PMTiles series');

    await addArchive('https://example.com/roads-2024.pmtiles');
    await addArchive('https://example.com/roads-latest.pmtiles');
    expect(seriesUrl()).toBe('pmtiles://https://example.com/roads-2024.pmtiles');

    fireEvent.change(screen.getByRole('textbox', { name: 'Time for roads-latest.pmtiles' }), {
      target: { value: '2001' },
    });
    expect(seriesUrl()).toBe('pmtiles://https://example.com/roads-latest.pmtiles');
  });

  it('takes the series off the map when the source goes back to geoplumb', async () => {
    await panel();
    pick('Source', 'PMTiles series');
    await addArchive('https://example.com/roads-2024.pmtiles');
    expect(seriesUrl()).toBeDefined();

    pick('Source', 'Geoplumb layers');
    expect(active.getSource(SERIES_SOURCE)).toBeUndefined();
    expect(active.layerIds()).toEqual([]);
  });
});
