import { useAgentLayerStore } from '../store/agentLayers';
import { featuresToGeoJSON, useDrawStore } from '../store/draw';

export interface GeoJsonSource {
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
}

/** The drawn features, as one source, plus every loaded/plugin layer. */
export function useGeoJsonSources(): GeoJsonSource[] {
  const drawn = useDrawStore((s) => s.features);
  const layers = useAgentLayerStore((s) => s.layers);

  const sources: GeoJsonSource[] = [];
  if (drawn.length > 0) {
    sources.push({
      id: 'draw:features',
      name: `Drawn features (${drawn.length})`,
      geojson: featuresToGeoJSON(drawn),
    });
  }
  for (const layer of layers) {
    sources.push({ id: layer.id, name: layer.name, geojson: layer.geojson });
  }
  return sources;
}

/** Property keys present on a source's features, for "group by field" style selects. */
export function propertyKeys(source: GeoJsonSource | undefined): string[] {
  if (!source) return [];
  const keys = new Set<string>();
  for (const f of source.geojson.features) {
    for (const k of Object.keys(f.properties ?? {})) keys.add(k);
  }
  return [...keys];
}
