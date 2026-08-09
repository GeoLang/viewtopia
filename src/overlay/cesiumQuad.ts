import {
  Cartesian2,
  Cartesian3,
  Color,
  type Entity,
  ImageMaterialProperty,
  PolygonHierarchy,
} from 'cesium';
import type { AgentRasterLayer } from '../store/agentLayers';

/**
 * An image overlay whose corners are not a rectangle, drawn on Cesium as a
 * textured polygon. Cesium's imagery layers take a rectangle only, so a dragged
 * quad would show as its envelope there.
 */

export const OVERLAY_ENTITY_PREFIX = 'agent-raster-';

/** Corner of the image each position maps to, in the store's TL, TR, BR, BL order. */
const CORNER_TEXTURE_COORDINATES = [
  new Cartesian2(0, 1),
  new Cartesian2(1, 1),
  new Cartesian2(1, 0),
  new Cartesian2(0, 0),
];

// PolygonHierarchy is typed for the Cartesian3 positions it usually holds, but
// textureCoordinates wants Cartesian2 in the same shape and Cesium ships no
// separate type for it
const textureCorners = new PolygonHierarchy(
  CORNER_TEXTURE_COORDINATES as unknown as Cartesian3[],
);

export function quadOverlayEntity(layer: AgentRasterLayer): Entity.ConstructorOptions {
  return {
    id: `${OVERLAY_ENTITY_PREFIX}${layer.id}`,
    polygon: {
      hierarchy: new PolygonHierarchy(
        layer.corners.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat)),
      ),
      // a height keeps this off the terrain-draped path, which is the only one
      // that ignores textureCoordinates
      height: 0,
      textureCoordinates: textureCorners,
      material: new ImageMaterialProperty({
        image: layer.url,
        transparent: true,
        color: new Color(1, 1, 1, layer.opacity),
      }),
    },
  };
}
