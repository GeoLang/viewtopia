import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { Cartesian3, Ellipsoid, EntityCollection, JulianDate, type Property, type Viewer } from 'cesium';
import { useAnnotationsCesium } from '../../src/hooks/useAnnotationsCesium';
import { useAnnotationStore } from '../../src/store/annotations';
import { useAppStore } from '../../src/store/app';

const PARIS = { id: 'paris', label: 'Paris', color: '#a78bfa', lat: 48.86, lng: 2.35, height: 35, createdAt: 1 };
const SYDNEY = { id: 'sydney', label: 'Sydney', color: '#a78bfa', lat: -33.87, lng: 151.21, height: 5, createdAt: 2 };

function pinsSeenFrom(camera: Cartesian3) {
  const entities = new EntityCollection();
  const viewer = {
    entities,
    camera: { positionWC: camera },
    scene: { ellipsoid: Ellipsoid.WGS84, canvas: { style: { cursor: '' } } },
    isDestroyed: () => false,
  } as unknown as Viewer;
  renderHook(() => useAnnotationsCesium({ current: viewer } as MutableRefObject<Viewer | null>));
  const time = JulianDate.now();
  return (id: string) => {
    const entity = entities.getById(`annot-${id}`);
    const position = entity?.position?.getValue(time);
    if (!entity?.point || !entity.label || !position) throw new Error(`no pin ${id}`);
    const depthTestDistance = (property: Property | undefined) => property?.getValue(time) as number;
    return {
      distance: Cartesian3.distance(camera, position),
      pointDepthTestOff: depthTestDistance(entity.point.disableDepthTestDistance),
      labelDepthTestOff: depthTestDistance(entity.label.disableDepthTestDistance),
    };
  };
}

describe('annotation pin depth test', () => {
  afterEach(() => {
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  it('draws a pin on the near side over terrain and leaves a pin on the far side behind the globe', () => {
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
    useAnnotationStore.setState({ annotations: [PARIS, SYDNEY], pendingPlacement: null });

    const pin = pinsSeenFrom(Cartesian3.fromDegrees(5, 48, 20_000_000));

    const paris = pin('paris');
    expect(paris.distance).toBeLessThan(paris.pointDepthTestOff);
    expect(paris.distance).toBeLessThan(paris.labelDepthTestOff);
    const sydney = pin('sydney');
    expect(sydney.distance).toBeGreaterThan(sydney.pointDepthTestOff);
    expect(sydney.distance).toBeGreaterThan(sydney.labelDepthTestOff);
  });

  it('draws a pin near a low camera over terrain', () => {
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
    useAnnotationStore.setState({ annotations: [PARIS], pendingPlacement: null });

    const paris = pinsSeenFrom(Cartesian3.fromDegrees(2.36, 48.86, 300))('paris');

    expect(paris.distance).toBeLessThan(paris.pointDepthTestOff);
  });
});
