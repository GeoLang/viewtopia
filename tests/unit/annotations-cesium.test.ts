import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { Viewer } from 'cesium';

interface FakeCartesian {
  lon: number;
  lat: number;
  height: number;
}

type ClickAction = (click: { position: { x: number; y: number } }) => void;

interface FakeHandler {
  actions: Map<number, ClickAction>;
  destroyed: boolean;
}

const createdHandlers = vi.hoisted((): FakeHandler[] => []);

vi.mock('cesium', async (importOriginal) => ({
  CallbackProperty: (await importOriginal<typeof import('cesium')>()).CallbackProperty,
  Cartesian2: class {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  Cartesian3: {
    fromDegrees: (lng: number, lat: number, height: number) => ({ lng, lat, height }),
  },
  Cartographic: {
    fromCartesian: (position: FakeCartesian) => ({
      longitude: position.lon,
      latitude: position.lat,
      height: position.height,
    }),
  },
  Color: {
    fromCssColorString: (color: string) => color,
    WHITE: 'white',
    BLACK: 'black',
  },
  Math: { toDegrees: (degrees: number) => degrees },
  ScreenSpaceEventHandler: class {
    actions = new Map<number, ClickAction>();
    destroyed = false;
    constructor() {
      createdHandlers.push(this);
    }
    setInputAction(action: ClickAction, type: number) {
      this.actions.set(type, action);
    }
    destroy() {
      this.destroyed = true;
    }
  },
  ScreenSpaceEventType: { LEFT_CLICK: 2 },
  VerticalOrigin: { BOTTOM: 'bottom' },
  LabelStyle: { FILL_AND_OUTLINE: 'fill' },
}));

import { ScreenSpaceEventType } from 'cesium';
import { useAnnotationsCesium } from '../../src/hooks/useAnnotationsCesium';
import { useAnnotationStore } from '../../src/store/annotations';
import { useAppStore } from '../../src/store/app';
import { readAnnotationPoint } from '../../src/viewer/annotationPoint';

function fakeViewer(pick: FakeCartesian | undefined, supported = true) {
  const entities: { id: string; position: unknown }[] = [];
  return {
    entities,
    scene: {
      canvas: { style: { cursor: '' } },
      pickPositionSupported: supported,
      pickPosition: vi.fn(() => pick),
      globe: { ellipsoid: {} },
    },
    camera: { pickEllipsoid: vi.fn(() => (supported ? undefined : pick)) },
    entitiesApi: {
      values: entities,
      getById: (id: string) => entities.find((entity) => entity.id === id),
      add: (entity: { id: string; position: unknown }) => {
        entities.push(entity);
        return entity;
      },
      remove: vi.fn(),
    },
    isDestroyed: () => false,
  };
}

function asViewer(viewer: ReturnType<typeof fakeViewer>) {
  return { ...viewer, entities: viewer.entitiesApi } as unknown as Viewer;
}

function click() {
  const handler = createdHandlers.filter((created) => !created.destroyed).at(-1);
  const action = handler?.actions.get(ScreenSpaceEventType.LEFT_CLICK);
  if (!action) throw new Error('no left click action set');
  act(() => {
    action({ position: { x: 10, y: 20 } });
  });
}

describe('readAnnotationPoint', () => {
  it('uses the depth position when the scene can read it', () => {
    const viewer = asViewer(fakeViewer({ lon: 7.26, lat: 46.75, height: 8.5 }));
    expect(readAnnotationPoint(viewer, { x: 1, y: 2 } as never)).toEqual({
      lng: 7.26,
      lat: 46.75,
      height: 8.5,
    });
  });

  it('falls back to the ellipsoid when the depth read misses', () => {
    const raw = fakeViewer(undefined);
    raw.camera.pickEllipsoid.mockReturnValue({ lon: 7.25, lat: 46.75, height: 0 });
    const point = readAnnotationPoint(asViewer(raw), { x: 1, y: 2 } as never);
    expect(point).toEqual({ lng: 7.25, lat: 46.75, height: 0 });
    expect(raw.scene.pickPosition).toHaveBeenCalled();
  });

  it('does not read depth when the scene cannot', () => {
    const raw = fakeViewer({ lon: 7.25, lat: 46.75, height: 0 }, false);
    const point = readAnnotationPoint(asViewer(raw), { x: 1, y: 2 } as never);
    expect(point?.height).toBe(0);
    expect(raw.scene.pickPosition).not.toHaveBeenCalled();
  });
});

describe('useAnnotationsCesium', () => {
  beforeEach(() => {
    createdHandlers.length = 0;
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
  });

  afterEach(() => {
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  it('stores the clicked height and draws the pin there', () => {
    const raw = fakeViewer({ lon: 7.26, lat: 46.75, height: 8.5 });
    const viewerRef = { current: asViewer(raw) } as MutableRefObject<Viewer | null>;
    renderHook(() => useAnnotationsCesium(viewerRef));
    useAnnotationStore.getState().startPlacement('Window', '#a78bfa');

    click();

    expect(useAnnotationStore.getState().annotations[0]).toMatchObject({
      label: 'Window',
      lng: 7.26,
      lat: 46.75,
      height: 8.5,
    });
    expect(raw.entities[0]?.position).toEqual({ lng: 7.26, lat: 46.75, height: 8.5 });
  });

  it('draws a pin with no height on the ellipsoid', () => {
    const raw = fakeViewer(undefined);
    useAnnotationStore.setState({
      annotations: [
        {
          id: 'ground',
          label: 'Site',
          color: '#a78bfa',
          lat: 46.75,
          lng: 7.26,
          createdAt: 1,
        },
      ],
      pendingPlacement: null,
    });
    const viewerRef = { current: asViewer(raw) } as MutableRefObject<Viewer | null>;
    renderHook(() => useAnnotationsCesium(viewerRef));
    expect(raw.entities[0]?.position).toEqual({ lng: 7.26, lat: 46.75, height: 0 });
  });
});
