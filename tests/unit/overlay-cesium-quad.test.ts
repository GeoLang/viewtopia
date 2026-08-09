import { describe, expect, it } from 'vitest';
import { Cartographic, JulianDate, Math as CesiumMath } from 'cesium';
import { quadOverlayEntity, OVERLAY_ENTITY_PREFIX } from '../../src/overlay/cesiumQuad';
import { cornersOfBbox, type Corners } from '../../src/overlay/georeference';

const quad: Corners = [
  [12, 46.2],
  [13.4, 46],
  [13, 45],
  [12.1, 45.1],
];

function entityFor(corners: Corners, opacity = 0.8) {
  return quadOverlayEntity({
    id: 'plan',
    name: 'site plan',
    url: 'data:image/png;base64,AAA',
    corners,
    opacity,
    visible: true,
  });
}

describe('quadOverlayEntity', () => {
  it('puts the image on a polygon through the overlay corners', () => {
    const entity = entityFor(quad);
    expect(entity.id).toBe(`${OVERLAY_ENTITY_PREFIX}plan`);

    const hierarchy = entity.polygon?.hierarchy as { positions: unknown[] };
    const degrees = (hierarchy.positions as Parameters<typeof Cartographic.fromCartesian>[0][]).map(
      (position) => {
        const carto = Cartographic.fromCartesian(position);
        return [
          CesiumMath.toDegrees(carto.longitude),
          CesiumMath.toDegrees(carto.latitude),
        ];
      },
    );
    expect(degrees).toHaveLength(4);
    degrees.forEach(([lng, lat], index) => {
      expect(lng).toBeCloseTo(quad[index][0], 6);
      expect(lat).toBeCloseTo(quad[index][1], 6);
    });
  });

  it('sets a height, without which Cesium would drape it and ignore the warp', () => {
    expect(entityFor(quad).polygon?.height).toBe(0);
  });

  it('maps the four corners onto the corners of the image', () => {
    const textureCoordinates = entityFor(quad).polygon?.textureCoordinates as {
      positions: { x: number; y: number }[];
    };
    // top left, top right, bottom right, bottom left, matching the corner order
    expect(textureCoordinates.positions.map((p) => [p.x, p.y])).toEqual([
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });

  it('carries the image and its opacity', () => {
    const material = entityFor(quad, 0.4).polygon?.material as {
      image: { getValue: (t: JulianDate) => string };
      color: { getValue: (t: JulianDate) => { alpha: number } };
      transparent: { getValue: (t: JulianDate) => boolean };
    };
    const now = JulianDate.now();
    expect(material.image.getValue(now)).toBe('data:image/png;base64,AAA');
    expect(material.color.getValue(now).alpha).toBeCloseTo(0.4, 6);
    expect(material.transparent.getValue(now)).toBe(true);
  });
});
