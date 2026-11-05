import type * as maplibregl from 'maplibre-gl';

export function lineWithVertexFeatures(points: [number, number][]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: points },
    });
  }
  for (const point of points) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: point },
    });
  }
  return features;
}

export function setToolGeoJson(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
  layers: maplibregl.AddLayerObject[],
) {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(sourceId, { type: 'geojson', data });
  for (const layer of layers) map.addLayer(layer);
}
