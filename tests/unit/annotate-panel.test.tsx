import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// the panel only reads the viewer to find the screen centre, so the WebGL
// bundle stays out
vi.mock('cesium', () => ({
  Cartesian2: class {},
  Math: { toDegrees: (radians: number) => radians },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
}));

import { AnnotatePanel } from '../../src/components/tools/AnnotatePanel';
import { useAnnotationStore } from '../../src/store/annotations';
import { useAppStore } from '../../src/store/app';

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

const renderPanel = () =>
  render(
    <MantineProvider>
      <AnnotatePanel onClose={vi.fn()} />
    </MantineProvider>,
  );

const label = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText('Annotation label…'), { target: { value: text } });

describe('AnnotatePanel', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  afterEach(cleanup);

  it('starts a placement on MapLibre instead of reporting no viewer', () => {
    renderPanel();
    label('Site A');
    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));

    expect(useAnnotationStore.getState().pendingPlacement).toEqual({
      label: 'Site A',
      color: '#a78bfa',
    });
    expect(screen.getByTestId('annotate-status')).toHaveTextContent('Click the map to place');
    expect(screen.queryByText('No active viewer')).not.toBeInTheDocument();
  });

  it('reports the point a renderer placed the pending annotation at', () => {
    renderPanel();
    label('Site A');
    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));

    act(() => {
      useAnnotationStore.getState().placePendingAnnotation(7.4, 43.7);
    });

    expect(screen.getByTestId('annotate-status')).toHaveTextContent('Placed at 43.700, 7.400');
    expect(screen.getByTestId('annotate-count')).toHaveTextContent('1');
    expect(screen.getByPlaceholderText('Annotation label…')).toHaveValue('');
  });

  it('cancels the pending placement on a second click and on close', () => {
    const { unmount } = renderPanel();
    label('Site A');
    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Click map…' }));
    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
    expect(useAnnotationStore.getState().pendingPlacement).not.toBeNull();
    unmount();
    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();
  });

  it('says click to place needs the globe on the 2D map', () => {
    useAppStore.setState({ activeTab: 'map' });
    renderPanel();
    label('Site A');
    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));

    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();
    expect(screen.getByTestId('annotate-status')).toHaveTextContent(
      'Click to place needs the 3D globe',
    );
  });

  it('adds at the shared camera when no Cesium viewer answers', () => {
    renderPanel();
    label('Site A');
    fireEvent.click(screen.getByRole('button', { name: 'Add at center' }));

    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useAnnotationStore.getState().annotations[0].label).toBe('Site A');
    expect(screen.getByTestId('annotate-status')).toHaveTextContent(/^Placed at /);
  });
});
