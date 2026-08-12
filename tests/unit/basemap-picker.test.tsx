import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BasemapRendererControl } from '../../src/components/BasemapRendererControl';
import { useAppStore } from '../../src/store/app';

// MantineProvider reads the color scheme through matchMedia, and the popover
// measures itself, all missing from jsdom
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

const ARCHIVE = 'planet.pmtiles';

function openPicker() {
  render(
    <MantineProvider>
      <BasemapRendererControl />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByLabelText('Basemap & renderer'));
}

describe('the basemap picker on a local archive', () => {
  beforeEach(() => {
    useAppStore.setState({ activeTab: 'globe', renderer: 'maplibre', basemap: 'local' });
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ basemap: 'dark', localBasemap: null });
  });

  it('names the archive it is drawing', async () => {
    useAppStore.setState({ localBasemap: { name: ARCHIVE, status: 'loaded', kind: 'vector' } });
    openPicker();
    expect(await screen.findByDisplayValue(ARCHIVE)).toBeInTheDocument();
  });

  it('asks for the file again after a reload dropped it', async () => {
    useAppStore.setState({ localBasemap: { name: ARCHIVE, status: 'needs-file' } });
    openPicker();
    expect(await screen.findByText(`${ARCHIVE} has to be picked again after a reload.`))
      .toBeInTheDocument();
  });

  it('says a renderer that cannot read it is showing no basemap', async () => {
    useAppStore.setState({
      renderer: 'cesium',
      localBasemap: { name: ARCHIVE, status: 'loaded', kind: 'vector' },
    });
    openPicker();
    expect(await screen.findByText(/Only MapLibre reads a .pmtiles archive/)).toBeInTheDocument();
  });
});
