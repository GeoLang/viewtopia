import type { AgentLayer } from '../store/agentLayers';

/** [west, south, east, north] covering every position, or null if there are none. */
export function agentLayersBounds(
  layers: AgentLayer[],
): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [180, 90, -180, -90];
  let any = false;

  for (const layer of layers) {
    for (const f of layer.geojson.features ?? []) {
      forEachPosition(f.geometry, ([lng, lat]) => {
        any = true;
        if (lng < bounds[0]) bounds[0] = lng;
        if (lat < bounds[1]) bounds[1] = lat;
        if (lng > bounds[2]) bounds[2] = lng;
        if (lat > bounds[3]) bounds[3] = lat;
      });
    }
  }

  return any ? bounds : null;
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
