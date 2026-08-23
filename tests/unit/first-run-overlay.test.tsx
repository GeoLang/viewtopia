import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FirstRunOverlay } from '../../src/onboarding/FirstRunOverlay';
import { FIRST_RUN_DISMISSED_KEY, firstRunVisible } from '../../src/onboarding/firstRun';
import { useLiveStore } from '../../src/live/liveStore';
import { useProjectsStore } from '../../src/projects/projectsStore';
import { useAgentLayerStore } from '../../src/store/agentLayers';

function draw(): void {
  render(
    <MantineProvider>
      <FirstRunOverlay />
    </MantineProvider>,
  );
}

const fresh = {
  dismissed: false,
  layerCount: 0,
  activeProjectId: null,
  liveDocumentId: null,
};

describe('first run guidance', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    localStorage.removeItem(FIRST_RUN_DISMISSED_KEY);
    useAgentLayerStore.setState({ layers: [] });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    useLiveStore.setState({ documentId: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.removeItem(FIRST_RUN_DISMISSED_KEY);
  });

  it('shows the three entry actions on a fresh profile', () => {
    draw();
    expect(screen.getByTestId('first-run-overlay')).toBeInTheDocument();
    expect(screen.getByText('Import data')).toBeInTheDocument();
    expect(screen.getByText('Create or open a project')).toBeInTheDocument();
    expect(screen.getByText('Start a live session')).toBeInTheDocument();
  });

  it('stays gone after one dismissal', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByTestId('first-run-overlay')).not.toBeInTheDocument();
    expect(localStorage.getItem(FIRST_RUN_DISMISSED_KEY)).not.toBeNull();

    cleanup();
    draw();
    expect(screen.queryByTestId('first-run-overlay')).not.toBeInTheDocument();
  });

  it('retires itself for good once data is imported', () => {
    draw();
    expect(screen.getByTestId('first-run-overlay')).toBeInTheDocument();

    act(() => {
      useAgentLayerStore.setState({
        layers: [{ id: 'layer-1', name: 'roads', color: '#38bdf8', geojson: { type: 'FeatureCollection', features: [] } }],
      });
    });
    expect(screen.queryByTestId('first-run-overlay')).not.toBeInTheDocument();

    // removing the layer must not bring it back
    act(() => {
      useAgentLayerStore.setState({ layers: [] });
    });
    expect(screen.queryByTestId('first-run-overlay')).not.toBeInTheDocument();
    expect(localStorage.getItem(FIRST_RUN_DISMISSED_KEY)).not.toBeNull();
  });

  it('hides while a project is open or a live session is running', () => {
    expect(firstRunVisible(fresh)).toBe(true);
    expect(firstRunVisible({ ...fresh, activeProjectId: 'project-1' })).toBe(false);
    expect(firstRunVisible({ ...fresh, liveDocumentId: 'document-1' })).toBe(false);
    expect(firstRunVisible({ ...fresh, dismissed: true })).toBe(false);
  });
});
