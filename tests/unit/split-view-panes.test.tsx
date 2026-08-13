import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SplitViewPanel } from '../../src/components/tools/SplitViewPanel';
import { useAppStore } from '../../src/store/app';
import {
  useSplitViewStore,
  usePanes,
  VIEWER_PANE,
  COMPARE_PANE,
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
  });
});

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

  it('sends the left pane picker to the viewer', () => {
    panel();

    pick('Left pane basemap', 'Topo');

    expect(useAppStore.getState().basemap).toBe('topo');
    expect(useSplitViewStore.getState().comparePanes[0].basemap).toBe('satellite');
  });
});
