import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SplitViewPanel } from '../../src/components/tools/SplitViewPanel';
import { useAppStore } from '../../src/store/app';
import { DEFAULT_BASEMAP } from '../../src/hooks/basemapTiles';
import {
  useSplitViewStore,
  usePanes,
  paneRendererChoices,
  VIEWER_PANE,
  COMPARE_PANE,
  type Pane,
} from '../../src/store/splitView';

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

beforeEach(() => {
  useAppStore.setState({
    activeTab: 'globe',
    renderer: 'maplibre',
    basemap: 'dark',
    localBasemap: null,
  });
  useSplitViewStore.setState({
    active: true,
    comparePanes: [{ renderer: 'maplibre', basemap: 'satellite' }],
    activePane: VIEWER_PANE,
  });
});

/** The pane list the way usePanes builds it, read outside a render. */
function panesNow(): Pane[] {
  const app = useAppStore.getState();
  return [
    { renderer: app.renderer, basemap: app.basemap },
    ...useSplitViewStore.getState().comparePanes,
  ];
}

/** Whether one pane's renderer select still offers Cesium. */
function cesiumOffered(panes: Pane[], index: number): boolean {
  return paneRendererChoices(panes, index).some((c) => c.value === 'cesium' && !c.disabled);
}

function panel() {
  return render(
    <MantineProvider>
      <SplitViewPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

describe('split view panes', () => {
  it('lists the viewer first, then the panes beside it', () => {
    const { result } = renderHook(() => usePanes());
    expect(result.current).toEqual([
      { renderer: 'maplibre', basemap: 'dark' },
      { renderer: 'maplibre', basemap: 'satellite' },
    ]);
  });

  it('keeps every pane on its own basemap', () => {
    useSplitViewStore.getState().setPaneBasemap(COMPARE_PANE, 'osm');

    expect(useSplitViewStore.getState().comparePanes).toEqual([
      { renderer: 'maplibre', basemap: 'osm' },
    ]);
    expect(useAppStore.getState().basemap).toBe('dark');
  });

  it('takes the viewer pane back to the app store every tool reads', () => {
    useSplitViewStore.getState().setPaneBasemap(VIEWER_PANE, 'topo');
    useSplitViewStore.getState().setPaneRenderer(VIEWER_PANE, 'cesium');

    expect(useAppStore.getState().basemap).toBe('topo');
    expect(useAppStore.getState().renderer).toBe('cesium');
    expect(useSplitViewStore.getState().comparePanes).toEqual([
      { renderer: 'maplibre', basemap: 'satellite' },
    ]);
  });

  it('addresses a further pane the way it addresses the second', () => {
    useSplitViewStore.getState().setComparePanes([
      { renderer: 'maplibre', basemap: 'satellite' },
      { renderer: 'maplibre', basemap: 'osm' },
    ]);

    useSplitViewStore.getState().setPaneBasemap(COMPARE_PANE + 1, 'topo');

    expect(useSplitViewStore.getState().comparePanes.map((p) => p.basemap)).toEqual([
      'satellite',
      'topo',
    ]);
  });

  it('fills the grid with default panes and drops them again', () => {
    useSplitViewStore.getState().setLayout('grid');

    expect(useSplitViewStore.getState().comparePanes).toEqual([
      { renderer: 'maplibre', basemap: 'satellite' },
      { renderer: 'maplibre', basemap: DEFAULT_BASEMAP },
      { renderer: 'maplibre', basemap: DEFAULT_BASEMAP },
    ]);

    useSplitViewStore.getState().setLayout('twoAcross');

    expect(useSplitViewStore.getState().comparePanes).toEqual([
      { renderer: 'maplibre', basemap: 'satellite' },
    ]);
  });

  it('styles the pane that was clicked', () => {
    useSplitViewStore.getState().setLayout('grid');
    useSplitViewStore.getState().setActivePane(3);

    expect(useSplitViewStore.getState().activePane).toBe(3);
  });

  it('takes the styling back to the viewer when the grid shrinks', () => {
    useSplitViewStore.getState().setLayout('grid');
    useSplitViewStore.getState().setActivePane(3);

    useSplitViewStore.getState().setLayout('twoAcross');

    expect(useSplitViewStore.getState().activePane).toBe(VIEWER_PANE);
  });

  it('takes the styling back to the viewer when the split closes', () => {
    useSplitViewStore.getState().setActivePane(COMPARE_PANE);

    useSplitViewStore.getState().setActive(false);

    expect(useSplitViewStore.getState().activePane).toBe(VIEWER_PANE);
  });

  it('offers the 2D renderer beside the viewer only', () => {
    const panes = panesNow();

    expect(paneRendererChoices(panes, VIEWER_PANE).map((c) => c.value)).toEqual([
      'cesium',
      'maplibre',
    ]);
    expect(paneRendererChoices(panes, COMPARE_PANE).map((c) => c.value)).toEqual([
      'cesium',
      'maplibre',
      'leaflet',
    ]);
  });

  it('closes Cesium to every pane but the one already drawing it', () => {
    useAppStore.setState({ renderer: 'cesium' });
    const panes = panesNow();

    expect(cesiumOffered(panes, VIEWER_PANE)).toBe(true);
    expect(cesiumOffered(panes, COMPARE_PANE)).toBe(false);
  });
});

describe('the split view panel', () => {
  it('shows each pane the basemap that pane is drawing', async () => {
    panel();

    expect(await screen.findByRole('textbox', { name: 'Left pane basemap' })).toHaveValue('Dark');
    expect(screen.getByRole('textbox', { name: 'Right pane basemap' })).toHaveValue('Satellite');
  });

  it('moves only the pane whose picker was used', () => {
    panel();

    pick('Right pane basemap', 'OSM');

    expect(useSplitViewStore.getState().comparePanes[0].basemap).toBe('osm');
    expect(useAppStore.getState().basemap).toBe('dark');
  });

  it('names every pane by its quadrant once the grid is picked', async () => {
    panel();

    pick('Layout', '2x2 grid');

    expect(
      await screen.findByRole('textbox', { name: 'Top left pane basemap' }),
    ).toHaveValue('Dark');
    expect(screen.getByRole('textbox', { name: 'Bottom right pane basemap' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Right pane' })).toBeNull();
  });

  it('closes the Cesium option to a pane while the viewer holds it', () => {
    useAppStore.setState({ renderer: 'cesium' });
    panel();

    fireEvent.click(screen.getByRole('textbox', { name: 'Right pane' }));
    const options = within(screen.getByRole('listbox', { name: 'Right pane' }));

    expect(options.getByRole('option', { name: 'CesiumJS (3D)' })).toHaveAttribute(
      'data-combobox-disabled',
    );
    expect(options.getByRole('option', { name: 'Leaflet (2D)' })).not.toHaveAttribute(
      'data-combobox-disabled',
    );
  });

  it('sends the left pane picker to the viewer', () => {
    panel();

    pick('Left pane basemap', 'Topo');

    expect(useAppStore.getState().basemap).toBe('topo');
    expect(useSplitViewStore.getState().comparePanes[0].basemap).toBe('satellite');
  });
});
