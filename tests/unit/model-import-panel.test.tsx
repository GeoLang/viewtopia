import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the placement plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  HeadingPitchRoll: class {
    constructor(
      public heading = 0,
      public pitch = 0,
      public roll = 0,
    ) {}
  },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  ScreenSpaceEventHandler: vi.fn(function (this: Record<string, unknown>) {
    this.setInputAction = vi.fn((action: unknown, type: number) => {
      handlerActions.push({ action: action as ClickAction, type });
    });
    this.destroy = vi.fn(() => {
      destroyed += 1;
    });
  }),
  ScreenSpaceEventType: { LEFT_CLICK: 2 },
  Transforms: {
    headingPitchRollQuaternion: vi.fn((_origin: unknown, hpr: { heading: number }) => ({
      quaternionFor: hpr.heading,
    })),
  },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { ScreenSpaceEventType, Transforms } from 'cesium';
import { ModelImportPanel } from '../../src/components/tools/ModelImportPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';

type ClickAction = (click: { position: { x: number; y: number } }) => void;

const handlerActions: { action: ClickAction; type: number }[] = [];
let destroyed = 0;

// MantineProvider reads the color scheme through matchMedia, and Slider
// measures its track, both missing from jsdom
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

const GROUND = { x: 1, y: 2, z: 3 };

function fakeViewer(pickPositionSupported = true) {
  return {
    scene: {
      canvas: document.createElement('canvas'),
      pickPositionSupported,
      pickPosition: vi.fn(() => GROUND),
      globe: { ellipsoid: { name: 'WGS84' } },
    },
    camera: { pickEllipsoid: vi.fn(() => GROUND) },
    entities: {
      add: vi.fn((options: { id: string }) => ({ entity: options.id, options })),
      remove: vi.fn(() => true),
    },
    isDestroyed: () => false,
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

const useViewer = (v: FakeViewer | null) =>
  vi.mocked(getActiveCesiumViewer).mockReturnValue(v as never);

const renderPanel = () =>
  render(
    <MantineProvider>
      <ModelImportPanel onClose={() => {}} />
    </MantineProvider>,
  );

function selectFile(name: string) {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input rendered');
  fireEvent.change(input, { target: { files: [new File(['glb-bytes'], name)] } });
  return input;
}

// cesium calls the handler outside react, so the placement render needs act
const clickMap = () => {
  const armed = handlerActions.at(-1);
  if (!armed) throw new Error('no click handler armed');
  act(() => armed.action({ position: { x: 40, y: 60 } }));
};

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  handlerActions.length = 0;
  destroyed = 0;
  useViewer(null);
  useAppStore.setState({ renderer: 'cesium' });
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

describe('ModelImportPanel', () => {
  it('shows the renderer notice when there is no cesium viewer', () => {
    useViewer(null);
    renderPanel();

    expect(screen.getByTestId('model-import-no-cesium')).toHaveTextContent(
      'Model import needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('offers glTF and GLB only', () => {
    useViewer(fakeViewer());
    renderPanel();

    expect(selectFile('house.glb').accept).toBe('.gltf,.glb');
    expect(screen.queryByText(/obj|fbx|ifc/i)).toBeNull();
  });

  it('arms a one-shot map click once a file is chosen', () => {
    useViewer(fakeViewer());
    renderPanel();

    expect(handlerActions).toHaveLength(0);

    selectFile('house.glb');

    expect(handlerActions).toHaveLength(1);
    expect(handlerActions[0].type).toBe(ScreenSpaceEventType.LEFT_CLICK);
    expect(screen.getByTestId('model-import-hint')).toHaveTextContent(
      'Click the map to place house.glb',
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('places the model at the picked ground position and disarms the handler', () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    renderPanel();

    selectFile('house.glb');
    clickMap();

    expect(viewer.scene.pickPosition).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(viewer.camera.pickEllipsoid).not.toHaveBeenCalled();
    const options = viewer.entities.add.mock.calls[0][0] as {
      position: unknown;
      name: string;
      model: { uri: string; scale: number };
      orientation: unknown;
    };
    expect(options.position).toBe(GROUND);
    expect(options.name).toBe('house.glb');
    expect(options.model.uri).toBe('blob:house.glb');
    expect(options.model.scale).toBe(1);
    expect(Transforms.headingPitchRollQuaternion).toHaveBeenCalled();
    expect(destroyed).toBe(1);
    expect(screen.getByTestId('model-import-hint')).toHaveTextContent(/choose a gltf or glb file/i);
  });

  it('falls back to the ellipsoid pick when pickPosition is unsupported', () => {
    const viewer = fakeViewer(false);
    useViewer(viewer);
    renderPanel();

    selectFile('tower.gltf');
    clickMap();

    expect(viewer.camera.pickEllipsoid).toHaveBeenCalledWith({ x: 40, y: 60 }, { name: 'WGS84' });
    expect(viewer.scene.pickPosition).not.toHaveBeenCalled();
    expect(viewer.entities.add).toHaveBeenCalledTimes(1);
  });

  it('lists the placed model and removes its entity and blob url', () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    renderPanel();

    selectFile('house.glb');
    clickMap();

    const row = screen.getByTestId('model-import-row');
    expect(row).toHaveTextContent('house.glb');

    fireEvent.click(screen.getByRole('button', { name: 'Remove house.glb' }));

    expect(viewer.entities.remove).toHaveBeenCalledWith(viewer.entities.add.mock.results[0].value);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:house.glb');
    expect(screen.queryByTestId('model-import-row')).toBeNull();
  });

  it('keeps placed entities but revokes the blob urls on unmount', () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    const { unmount } = renderPanel();

    selectFile('house.glb');
    clickMap();
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:house.glb');
    expect(viewer.entities.remove).not.toHaveBeenCalled();
    expect(destroyed).toBe(1);
  });
});
