import { describe, expect, it } from 'vitest';
import { Cartesian3, OrthographicFrustum, PerspectiveFrustum } from 'cesium';
import type { Cesium3DTileset, Viewer } from 'cesium';
import {
  elevationHeading,
  leavePlanView,
  planViewIsOn,
  planViewRevision,
  showElevation,
  showFloorPlan,
} from '../../src/features/bim/planView';

function fakeViewer(): Viewer {
  const camera = {
    frustum: new PerspectiveFrustum({ fov: 1, aspectRatio: 1, near: 1, far: 100 }),
    switchToOrthographicFrustum(this: { frustum: PerspectiveFrustum | OrthographicFrustum }) {
      this.frustum = new OrthographicFrustum({ width: 1, aspectRatio: 1 });
    },
    switchToPerspectiveFrustum(this: { frustum: PerspectiveFrustum | OrthographicFrustum }) {
      this.frustum = new PerspectiveFrustum({ fov: 0.5, aspectRatio: 1, near: 1, far: 100 });
    },
    lookAtTransform() {
      return undefined;
    },
  };
  return { camera, scene: { requestRender() {} } } as unknown as Viewer;
}

const tileset = {
  boundingSphere: { center: Cartesian3.fromDegrees(0, 0, 0), radius: 10 },
} as unknown as Cesium3DTileset;

describe('elevationHeading', () => {
  it('looks back at the face it names', () => {
    expect(elevationHeading('north')).toBeCloseTo(Math.PI);
    expect(elevationHeading('east')).toBeCloseTo(-Math.PI / 2);
    expect(elevationHeading('south')).toBeCloseTo(0);
    expect(elevationHeading('west')).toBeCloseTo(Math.PI / 2);
  });
});

describe('plan view', () => {
  it('bumps a revision when a floor plan or an elevation opens and when it closes', () => {
    const viewer = fakeViewer();
    const start = planViewRevision();

    showFloorPlan(viewer, tileset);
    expect(planViewRevision()).toBe(start + 1);
    expect(planViewIsOn(viewer)).toBe(true);

    showElevation(viewer, tileset, 'east');
    expect(planViewRevision()).toBe(start + 2);
    expect(planViewIsOn(viewer)).toBe(true);

    leavePlanView(viewer);
    expect(planViewRevision()).toBe(start + 3);
    expect(planViewIsOn(viewer)).toBe(false);
    expect(viewer.camera.frustum).toBeInstanceOf(PerspectiveFrustum);
    expect((viewer.camera.frustum as PerspectiveFrustum).fov).toBe(1);
  });
});
