import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ToolPanels } from '../../src/components/ToolPanels';
import { useAppStore, type ToolPanel } from '../../src/store/app';
import { useDrawStore } from '../../src/store/draw';
import { useMeasureStore } from '../../src/store/measure';

vi.mock('../../src/duckdb', () => ({
  query: vi.fn(),
  queryAsGeoJson: vi.fn(),
  NoGeometryError: class extends Error {},
}));
vi.mock('../../src/duckdb/exportFile', () => ({ exportQuery: vi.fn() }));
vi.mock('../../src/duckdb/loaders', () => ({
  attachParquetUrl: vi.fn(),
  attachCsvUrl: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function openPanel(panel: ToolPanel) {
  useAppStore.getState().setActivePanel(panel);
  return render(
    <MantineProvider>
      <ToolPanels />
    </MantineProvider>,
  );
}

const pressEscape = () => act(() => fireEvent.keyDown(window, { key: 'Escape' }));

describe('leaving a draw or measure tool', () => {
  beforeEach(() => {
    useAppStore.setState({ activePanel: null });
    useDrawStore.getState().setMode(null);
    useMeasureStore.getState().setMode(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('closing the draw panel disarms the tool, so the map stops drawing', () => {
    openPanel('draw');
    act(() => useDrawStore.getState().setMode('circle'));

    act(() => useAppStore.getState().setActivePanel(null));

    expect(useDrawStore.getState().mode).toBeNull();
  });

  it('closing the measure panel disarms the tool', () => {
    openPanel('measure');
    act(() => useMeasureStore.getState().setMode('distance'));

    act(() => useAppStore.getState().setActivePanel(null));

    expect(useMeasureStore.getState().mode).toBeNull();
  });

  it('escape disarms an armed tool first and closes the panel on the next press', () => {
    openPanel('draw');
    act(() => useDrawStore.getState().setMode('circle'));

    pressEscape();
    expect(useDrawStore.getState().mode).toBeNull();
    expect(useAppStore.getState().activePanel).toBe('draw');

    pressEscape();
    expect(useAppStore.getState().activePanel).toBeNull();
  });
});
