import * as turf from '@turf/turf';
import { useAgentLayerStore, type AgentLayer } from '../store/agentLayers';
import { registerAction } from './registry';
import { resolveOne } from './resolve';

/** Enough matches to choose from, few enough to read in a chat turn. */
const MAX_MATCHES = 10;

const COORDINATE_DECIMALS = 4;

interface FeatureMatch {
  layerName: string;
  property: string;
  value: string;
  lon: number;
  lat: number;
}

function centroidOf(feature: GeoJSON.Feature): [number, number] | null {
  if (!feature.geometry) return null;
  const [lon, lat] = turf.centroid(feature).geometry.coordinates;
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

/** The first property of a feature whose text carries the query. */
function matchingProperty(
  feature: GeoJSON.Feature,
  query: string,
): { property: string; value: string } | null {
  for (const [property, value] of Object.entries(feature.properties ?? {})) {
    if (typeof value === 'string' && value.toLowerCase().includes(query)) {
      return { property, value };
    }
  }
  return null;
}

function search(layers: AgentLayer[], query: string): FeatureMatch[] {
  const matches: FeatureMatch[] = [];
  for (const layer of layers) {
    for (const feature of layer.geojson.features) {
      if (matches.length === MAX_MATCHES) return matches;
      const found = matchingProperty(feature, query);
      if (!found) continue;
      const centroid = centroidOf(feature);
      if (!centroid) continue;
      matches.push({
        layerName: layer.name,
        property: found.property,
        value: found.value,
        lon: centroid[0],
        lat: centroid[1],
      });
    }
  }
  return matches;
}

function describe(match: FeatureMatch): string {
  const place = `${match.lon.toFixed(COORDINATE_DECIMALS)}, ${match.lat.toFixed(COORDINATE_DECIMALS)}`;
  return `${match.layerName}: ${match.property} "${match.value}" at ${place}`;
}

registerAction({
  name: 'find_feature',
  description:
    'Find features whose properties carry some text, with the longitude and latitude of each.',
  parameters: {
    query: { type: 'string', description: 'Text to look for, case does not matter.', required: true },
    layer: { type: 'string', description: 'Layer id or name to search, or every layer.' },
  },
  reads: true,
  run: (args) => {
    const query = (args.query as string).trim().toLowerCase();
    const loaded = useAgentLayerStore.getState().layers;
    const searched =
      args.layer === undefined ? loaded : [resolveOne('layer', args.layer as string, loaded)];

    const matches = search(searched, query);
    if (matches.length === 0) {
      return { text: `Nothing in the loaded features matches "${args.query as string}".` };
    }
    const counted =
      matches.length === MAX_MATCHES ? `The first ${MAX_MATCHES} matches` : `${matches.length} matches`;
    return { text: `${counted}. ${matches.map(describe).join('. ')}.` };
  },
});
