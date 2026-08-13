import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TimelapsePanel } from '../../src/components/tools/TimelapsePanel';
import { useAppStore } from '../../src/store/app';
import { setActiveMapLibre, setPaneMapLibre } from '../../src/viewer/registry';
import { COMPARE_PANE } from '../../src/store/splitView';

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

const LAYER = {
  name: 'sentinel-ndvi',
  source: 'stac',
  collection: 'sentinel-2-l2a',
  defaultDatetime: null,
  temporalExtent: { start: '2024-01-01T00:00:00Z', end: '2024-04-01T00:00:00Z' },
};

vi.mock('../../src/lib/geoplumb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/geoplumb')>()),
  listLayers: vi.fn(async () => [LAYER]),
}));

type SourceDataEvent = { sourceId: string; isSourceLoaded: boolean };

/** Enough of a MapLibre map to add rasters to and to fire source events from. */
function fakeMap() {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, { id: string }>();
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const map = {
    handlers,
    isStyleLoaded: () => true,
    addSource: (id: string, spec: unknown) => sources.set(id, spec),
    addLayer: (spec: { id: string }) => layers.set(spec.id, spec),
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    removeSource: (id: string) => sources.delete(id),
    removeLayer: (id: string) => layers.delete(id),
    setPaintProperty: () => {},
    isSourceLoaded: () => true,
    on: (type: string, handler: (event: unknown) => void) => {
      const existing = handlers.get(type) ?? new Set();
      existing.add(handler);
      handlers.set(type, existing);
    },
    off: (type: string, handler: (event: unknown) => void) => {
      handlers.get(type)?.delete(handler);
    },
    once: () => {},
    emit: (type: string, event: unknown) => {
      act(() => {
        for (const handler of [...(handlers.get(type) ?? [])]) handler(event);
      });
    },
    listenerCount: () => [...handlers.values()].reduce((total, set) => total + set.size, 0),
  };
  return map;
}

type FakeMap = ReturnType<typeof fakeMap>;

let active: FakeMap;
let pane: FakeMap;

function asMapLibre(map: FakeMap): MapLibreMap {
  return map as unknown as MapLibreMap;
}

async function panel() {
  const view = render(
    <MantineProvider>
      <TimelapsePanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return view;
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

const loading = (sourceId: string): SourceDataEvent => ({ sourceId, isSourceLoaded: false });
const loaded = (sourceId: string): SourceDataEvent => ({ sourceId, isSourceLoaded: true });
const spinner = () => screen.queryByText('Pulling tiles…');

beforeEach(() => {
  active = fakeMap();
  pane = fakeMap();
  setActiveMapLibre(asMapLibre(active));
  setPaneMapLibre(COMPARE_PANE, asMapLibre(pane));
  useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
});

afterEach(() => {
  cleanup();
  setActiveMapLibre(null);
  setPaneMapLibre(COMPARE_PANE, null);
});

describe('TimelapsePanel tile loading', () => {
  it('shows the spinner while A pulls tiles on the active map', async () => {
    await panel();
    pick('Layer', 'sentinel-ndvi');
    expect(spinner()).not.toBeInTheDocument();

    active.emit('sourcedataloading', loading('timelapse-a'));
    expect(spinner()).toBeInTheDocument();

    active.emit('sourcedata', loaded('timelapse-a'));
    expect(spinner()).not.toBeInTheDocument();
  });

  it('shows the spinner while B pulls tiles on the split pane map', async () => {
    await panel();
    pick('Layer', 'sentinel-ndvi');

    pane.emit('sourcedataloading', loading('timelapse-b'));
    expect(spinner()).toBeInTheDocument();

    pane.emit('sourcedataabort', loaded('timelapse-b'));
    expect(spinner()).not.toBeInTheDocument();
  });

  it('stays up until both sources are done', async () => {
    await panel();
    pick('Layer', 'sentinel-ndvi');

    active.emit('sourcedataloading', loading('timelapse-a'));
    pane.emit('sourcedataloading', loading('timelapse-b'));
    active.emit('sourcedata', loaded('timelapse-a'));
    expect(spinner()).toBeInTheDocument();

    pane.emit('sourcedata', loaded('timelapse-b'));
    expect(spinner()).not.toBeInTheDocument();
  });

  it('ignores sources the compare does not own', async () => {
    await panel();
    pick('Layer', 'sentinel-ndvi');

    active.emit('sourcedataloading', loading('basemap'));
    expect(spinner()).not.toBeInTheDocument();
  });

  it('drops its listeners when the panel closes', async () => {
    const view = await panel();
    pick('Layer', 'sentinel-ndvi');
    expect(active.listenerCount()).toBeGreaterThan(0);
    expect(pane.listenerCount()).toBeGreaterThan(0);

    view.unmount();
    expect(active.listenerCount()).toBe(0);
    expect(pane.listenerCount()).toBe(0);
  });

  it('moves its B listeners to the active map when the modes blend', async () => {
    await panel();
    pick('Layer', 'sentinel-ndvi');
    pane.emit('sourcedataloading', loading('timelapse-b'));
    expect(spinner()).toBeInTheDocument();

    pick('Comparison Mode', 'Opacity Blend');
    expect(spinner()).not.toBeInTheDocument();
    expect(pane.listenerCount()).toBe(0);

    active.emit('sourcedataloading', loading('timelapse-b'));
    expect(spinner()).toBeInTheDocument();
  });
});
