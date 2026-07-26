import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BuildingsPanel } from '../../src/components/tools/BuildingsPanel';
import { useBuildingStore } from '../../src/store/buildings';
import { useAppStore } from '../../src/store/app';

// MantineProvider reads the color scheme through matchMedia, which jsdom lacks
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const renderPanel = () =>
  render(
    <MantineProvider>
      <BuildingsPanel onClose={() => {}} />
    </MantineProvider>,
  );

const loadButton = () => screen.getByRole('button', { name: /load buildings/i });
const showSwitch = () => screen.getByRole('switch', { name: /show buildings/i });

describe('BuildingsPanel', () => {
  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
    useBuildingStore.setState({ buildings: [], enabled: false, styleHasBuildings: false });
    useAppStore.setState({ renderer: 'maplibre' });
  });

  it('keeps the controls enabled on a style without its own buildings', () => {
    renderPanel();
    expect(showSwitch()).not.toBeDisabled();
    expect(loadButton()).not.toBeDisabled();
  });

  it('disables the controls when the basemap style already draws buildings', () => {
    useBuildingStore.setState({ styleHasBuildings: true });
    renderPanel();
    expect(showSwitch()).toBeDisabled();
    expect(loadButton()).toBeDisabled();
    expect(screen.getByText(/part of this basemap style/i)).toBeTruthy();
  });

  it('keeps the controls enabled on other renderers', () => {
    useBuildingStore.setState({ styleHasBuildings: true });
    useAppStore.setState({ renderer: 'cesium' });
    renderPanel();
    expect(showSwitch()).not.toBeDisabled();
    expect(loadButton()).not.toBeDisabled();
  });
});
