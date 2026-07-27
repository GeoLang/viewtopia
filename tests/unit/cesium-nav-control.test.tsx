import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Viewer } from 'cesium';
import { CesiumNavControl } from '../../src/components/CesiumNavControl';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

function fakeViewer() {
  return {
    isDestroyed: () => false,
    scene: {
      postRender: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      canvas: { clientWidth: 800, clientHeight: 600 },
    },
    camera: {
      heading: 0,
      pitch: -0.5,
      position: { clone: () => 'pos' },
      positionCartographic: { height: 10_000 },
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      flyTo: vi.fn(),
      // off-globe fallback path: rotateTo uses setView when nothing is picked
      pickEllipsoid: vi.fn(() => undefined),
      setView: vi.fn(),
    },
  } as unknown as Viewer;
}

let viewer: ReturnType<typeof fakeViewer>;

beforeEach(() => {
  viewer = fakeViewer();
  setActiveCesiumViewer(viewer as Viewer);
});

afterEach(() => {
  setActiveCesiumViewer(null);
  cleanup();
});

describe('CesiumNavControl', () => {
  it('zooms by a fraction of the camera height', () => {
    render(<CesiumNavControl />);
    screen.getByLabelText('Zoom in').click();
    expect(viewer.camera.zoomIn).toHaveBeenCalledWith(4000);
    screen.getByLabelText('Zoom out').click();
    expect(viewer.camera.zoomOut).toHaveBeenCalledWith(4000);
  });

  it('resets heading to north on a movement-free press', () => {
    render(<CesiumNavControl />);
    const compass = screen.getByLabelText('Reset bearing to north');
    fireEvent.pointerDown(compass, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(compass, { clientX: 100, pointerId: 1 });
    expect(viewer.camera.setView).toHaveBeenCalledWith(
      expect.objectContaining({
        orientation: expect.objectContaining({ heading: 0, pitch: -0.5 }),
      }),
    );
  });

  it('drag-rotates the heading and suppresses the north reset', () => {
    render(<CesiumNavControl />);
    const compass = screen.getByLabelText('Reset bearing to north');
    fireEvent.pointerDown(compass, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(compass, { clientX: 120, pointerId: 1 });
    // 20px * 0.5°/px = 10° from heading 0
    expect(viewer.camera.setView).toHaveBeenCalledWith(
      expect.objectContaining({
        orientation: expect.objectContaining({
          heading: expect.closeTo((10 * Math.PI) / 180, 5),
          pitch: -0.5,
        }),
      }),
    );
    fireEvent.pointerUp(compass, { clientX: 120, pointerId: 1 });
    // exactly the one drag setView; a click-reset would have added a second
    expect(viewer.camera.setView).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an active viewer', () => {
    setActiveCesiumViewer(null);
    render(<CesiumNavControl />);
    // must not throw; the buttons are inert
    screen.getByLabelText('Zoom in').click();
    expect(viewer.camera.zoomIn).not.toHaveBeenCalled();
  });
});
