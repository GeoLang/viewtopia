import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import basemapCatalog from '../../src/plugins/basemap-catalog';
import streetView from '../../src/plugins/street-view';
import type { PluginContext } from '../../src/plugins/sdk';

/**
 * The two plugin panels that talk to a keyed third party: without a key they
 * used to request anyway (jawg answers 400, the google embed 401), so they now
 * render a configure-a-key state instead.
 */

// MantineProvider reads the color scheme through matchMedia, and the street-view
// provider switch measures itself, both missing from jsdom
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

function makeCtx(values: Record<string, unknown> = {}): PluginContext {
  return {
    map: {
      flyTo: vi.fn(),
      getCursorCoords: vi.fn(() => null),
      onMapClick: vi.fn(() => () => {}),
      addGeoJsonLayer: vi.fn(),
      removeLayer: vi.fn(),
      fitBounds: vi.fn(),
    },
    store: {
      getLayers: () => [],
      getActivePanel: () => null,
      getBasemap: () => 'osm-standard',
      getRenderer: () => 'maplibre',
      getSettings: () => ({}),
    },
    api: { fetch: vi.fn(async () => new Response(null)), baseUrl: '/api/v1' },
    settings: {
      get: <T,>(key: string, defaultValue?: T) =>
        key in values ? (values[key] as T) : (defaultValue as T),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
      getAll: () => values,
    },
    close: vi.fn(),
  };
}

const renderPanel = (Panel: React.ComponentType<{ ctx: PluginContext }>, ctx: PluginContext) =>
  render(
    <MantineProvider>
      <Panel ctx={ctx} />
    </MantineProvider>,
  );

const imageSources = () =>
  screen.getAllByRole('img').map((img) => img.getAttribute('src') ?? '');

describe('basemap catalog previews', () => {
  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
  });

  it('previews no jawg tile and disables the source without an access token', () => {
    renderPanel(basemapCatalog.Panel, makeCtx());

    expect(screen.getAllByTestId('basemap-needs-key')).toHaveLength(3);
    expect(imageSources().filter((src) => src.includes('tile.jawg.io'))).toEqual([]);
    for (const name of ['Jawg Streets', 'Jawg Dark', 'Jawg Terrain']) {
      expect(screen.getByText(name).closest('button')).toBeDisabled();
    }
  });

  it('previews jawg tiles with the token once it is configured', () => {
    renderPanel(basemapCatalog.Panel, makeCtx({ jawgAccessToken: 'tok-123' }));

    expect(screen.queryByTestId('basemap-needs-key')).toBeNull();
    const jawg = imageSources().filter((src) => src.includes('tile.jawg.io'));
    expect(jawg).toHaveLength(3);
    for (const src of jawg) expect(src).toContain('access-token=tok-123');
    expect(screen.getByText('Jawg Streets').closest('button')).not.toBeDisabled();
  });

  it('selecting a keyed source stores the url with its token', () => {
    const ctx = makeCtx({ jawgAccessToken: 'tok-123' });
    renderPanel(basemapCatalog.Panel, ctx);

    screen.getByText('Jawg Dark').closest('button')?.click();
    expect(ctx.settings.set).toHaveBeenCalledWith(
      'activeBasemapUrl',
      'https://tile.jawg.io/jawg-dark/{z}/{x}/{y}.png?access-token=tok-123',
    );
  });
});

describe('street view embed', () => {
  beforeEach(() => {
    cleanup();
  });

  it('asks for a google key instead of loading the embed', () => {
    renderPanel(streetView.Panel, makeCtx({ defaultProvider: 'google' }));

    expect(screen.getByTestId('street-view-needs-key')).toBeVisible();
    expect(screen.queryByTitle('Street View')).toBeNull();
  });

  it('loads the embed with the configured key', () => {
    renderPanel(streetView.Panel, makeCtx({ defaultProvider: 'google', googleApiKey: 'gkey-1' }));

    expect(screen.queryByTestId('street-view-needs-key')).toBeNull();
    expect(screen.getByTitle('Street View')).toHaveAttribute(
      'src',
      expect.stringContaining('key=gkey-1'),
    );
  });
});
