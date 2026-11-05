import { HeadingPitchRange, Math as CesiumMath } from 'cesium';
import type { Cesium3DTileset, Viewer } from 'cesium';

const TILESET_VIEW_PITCH_DEGREES = -35;
const TILESET_VIEW_RANGE_IN_RADII = 3;

export function flyToTileset(viewer: Viewer, tileset: Cesium3DTileset): Promise<boolean> {
  // cesium's Viewer.flyTo stops one bounding sphere radius from a tileset's centre, which is inside a building
  return viewer.flyTo(tileset, {
    offset: new HeadingPitchRange(
      viewer.camera.heading,
      CesiumMath.toRadians(TILESET_VIEW_PITCH_DEGREES),
      tileset.boundingSphere.radius * TILESET_VIEW_RANGE_IN_RADII,
    ),
  });
}
