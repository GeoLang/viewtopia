import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// the panels reach cesium through the shared analysis lib, and only their
// signed-out gate is under test here, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Color: { fromCssColorString: () => ({}) },
  GeoJsonDataSource: { load: async () => ({}) },
  Rectangle: { fromDegrees: () => ({}) },
  SingleTileImageryProvider: { fromUrl: async () => ({}) },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { FloodPanel } from '../../src/components/tools/FloodPanel';
import { SolarPanel } from '../../src/components/tools/SolarPanel';
import { TerrainAnalysisPanel } from '../../src/components/tools/TerrainAnalysisPanel';
import { SIGN_IN_HINT } from '../../src/lib/terrainAnalysis';
import { useAuthStore } from '../../src/features/auth/store';
import { useAppStore } from '../../src/store/app';

// MantineProvider reads the color scheme through matchMedia, and the terrain
// panel's Select scrolls its dropdown, both missing from jsdom
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

const PANELS = [
  { name: 'FloodPanel', Panel: FloodPanel, action: /^simulate$/i, testId: 'flood-signin' },
  { name: 'SolarPanel', Panel: SolarPanel, action: /^compute$/i, testId: 'solar-signin' },
  {
    name: 'TerrainAnalysisPanel',
    Panel: TerrainAnalysisPanel,
    action: /^run$/i,
    testId: 'terrain-signin',
  },
];

describe.each(PANELS)('$name signed-out state', ({ Panel, action, testId }) => {
  const renderPanel = () =>
    render(
      <MantineProvider>
        <Panel onClose={() => {}} />
      </MantineProvider>,
    );

  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
    useAppStore.setState({ renderer: 'cesium' });
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
  });

  it('shows the sign-in hint and never fires the analysis POST', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    expect(screen.getByTestId(testId)).toHaveTextContent(SIGN_IN_HINT);
    const run = screen.getByRole('button', { name: action });
    expect(run).toBeDisabled();

    run.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs normally with a session token', () => {
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: { email: 'a@b.c' } });
    renderPanel();

    expect(screen.queryByTestId(testId)).toBeNull();
    expect(screen.getByRole('button', { name: action })).not.toBeDisabled();
  });
});
