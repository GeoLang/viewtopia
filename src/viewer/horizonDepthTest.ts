import { CallbackProperty, Cartesian3, type Viewer } from 'cesium';

export function depthTestOffUntilHorizon(viewer: Viewer): CallbackProperty {
  // cesium skips the depth test for points nearer than disableDepthTestDistance, and points on the far side of the earth are farther than its horizon
  return new CallbackProperty(() => {
    const fromCentre = Cartesian3.magnitude(viewer.camera.positionWC);
    const { minimumRadius } = viewer.scene.ellipsoid;
    if (fromCentre <= minimumRadius) return 0;
    return Math.sqrt(fromCentre * fromCentre - minimumRadius * minimumRadius);
  }, false);
}
