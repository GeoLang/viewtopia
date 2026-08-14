import type { AgentLayer } from '../store/agentLayers';

/** [west, south, east, north] covering every position, or null if there are none. */
export function agentLayersBounds(
  layers: AgentLayer[],
): [number, number, number, number] | null {
  return featuresBounds(layers.flatMap((layer) => layer.geojson.features ?? []));
}

/** [west, south, east, north] covering every position, or null if there are none. */
export function featuresBounds(
  features: GeoJSON.Feature[],
): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [180, 90, -180, -90];
  let any = false;

  for (const f of features) {
    forEachPosition(f.geometry, ([lng, lat]) => {
      any = true;
      if (lng < bounds[0]) bounds[0] = lng;
      if (lat < bounds[1]) bounds[1] = lat;
      if (lng > bounds[2]) bounds[2] = lng;
      if (lat > bounds[3]) bounds[3] = lat;
    });
  }

  if (!any) return null;

  // a single point (or near-degenerate extent) would otherwise fit at max zoom,
  // landing the camera on an anonymous street corner — pad to ~2km so the
  // result stays visible in context
  const MIN_EXTENT = 0.01;
  if (bounds[2] - bounds[0] < MIN_EXTENT) {
    const cx = (bounds[0] + bounds[2]) / 2;
    bounds[0] = cx - MIN_EXTENT / 2;
    bounds[2] = cx + MIN_EXTENT / 2;
  }
  if (bounds[3] - bounds[1] < MIN_EXTENT) {
    const cy = (bounds[1] + bounds[3]) / 2;
    bounds[1] = cy - MIN_EXTENT / 2;
    bounds[3] = cy + MIN_EXTENT / 2;
  }
  return bounds;
}

function forEachPosition(
  geometry: GeoJSON.Geometry | null,
  fn: (pos: GeoJSON.Position) => void,
): void {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) forEachPosition(g, fn);
    return;
  }
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      fn(c as GeoJSON.Position);
    } else if (Array.isArray(c)) {
      for (const inner of c) walk(inner);
    }
  };
  walk(geometry.coordinates);
}
