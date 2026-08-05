/**
 * Multi-part to single-part and back. Pure geometry bookkeeping, so these two
 * never reach the wasm module, but they sit in the same ops registry so the
 * panel and the batch runner treat them like any other tool.
 */

type Fc = GeoJSON.FeatureCollection;

const SINGLE_PART: Record<string, string> = {
  MultiPoint: 'Point',
  MultiLineString: 'LineString',
  MultiPolygon: 'Polygon',
};

const MULTI_PART: Record<string, string> = {
  Point: 'MultiPoint',
  MultiPoint: 'MultiPoint',
  LineString: 'MultiLineString',
  MultiLineString: 'MultiLineString',
  Polygon: 'MultiPolygon',
  MultiPolygon: 'MultiPolygon',
};

function parts(g: GeoJSON.Geometry): GeoJSON.Geometry[] {
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(parts);
  const single = SINGLE_PART[g.type];
  if (!single) return [g];
  return (g.coordinates as unknown[]).map(
    (coordinates) => ({ type: single, coordinates }) as GeoJSON.Geometry,
  );
}

/** One feature per part, each keeping the source feature's properties. */
export function explode(fc: Fc): Fc {
  return {
    type: 'FeatureCollection',
    features: fc.features.flatMap((f) =>
      f.geometry
        ? parts(f.geometry).map((geometry) => ({ ...f, geometry }) as GeoJSON.Feature)
        : [f],
    ),
  };
}

/** Every feature into one multi-geometry, which needs them all the same base type. */
export function collect(fc: Fc): Fc {
  const geometries = fc.features.map((f) => f.geometry).filter((g): g is GeoJSON.Geometry => !!g);
  if (geometries.length === 0) throw new Error('collect needs at least one feature with geometry');

  const type = MULTI_PART[geometries[0].type];
  if (!type || geometries.some((g) => MULTI_PART[g.type] !== type)) {
    throw new Error(
      `collect needs one geometry type, got ${[...new Set(geometries.map((g) => g.type))].join(', ')}`,
    );
  }

  const coordinates = geometries.flatMap((g) => {
    const own = (g as { coordinates: unknown }).coordinates;
    return SINGLE_PART[g.type] ? (own as unknown[]) : [own];
  });
  return {
    type: 'FeatureCollection',
    // the parts merge but their attributes cannot, so the first feature's win
    features: [
      {
        type: 'Feature',
        properties: fc.features[0]?.properties ?? {},
        geometry: { type, coordinates } as unknown as GeoJSON.Geometry,
      },
    ],
  };
}
