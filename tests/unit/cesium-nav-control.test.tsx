import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Viewer } from 'cesium';
import { CesiumNavControl } from '../../src/components/CesiumNavControl';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

function fakeViewer() {
  return {
    isDestroyed: () => false,
    scene: {
      postRender: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    },
    camera: {
      heading: 0,
      pitch: -0.5,
      position: { clone: () => 'pos' },
      positionCartographic: { height: 10_000 },
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      flyTo: vi.fn(),
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

  it('resets heading to north keeping position and pitch', () => {
    render(<CesiumNavControl />);
    screen.getByLabelText('Reset bearing to north').click();
    expect(viewer.camera.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'pos',
        orientation: expect.objectContaining({ heading: 0, pitch: -0.5 }),
      }),
    );
  });

  it('does nothing without an active viewer', () => {
    setActiveCesiumViewer(null);
    render(<CesiumNavControl />);
    // must not throw; the buttons are inert
    screen.getByLabelText('Zoom in').click();
    expect(viewer.camera.zoomIn).not.toHaveBeenCalled();
  });
});
