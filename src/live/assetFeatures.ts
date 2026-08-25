import type { AgentLayer } from '../store/agentLayers';
import { toRow, type FeatureProp } from '../store/featurePicker';
import { ASSET_ID_PROPERTY } from './types';

/**
 * The ptolemy feature standing for this asset, across every agent layer. The
 * model's tiles carry the asset id and nothing else about the asset, so this is
 * what the attributes beside a picked tile feature come from.
 */
export function assetFeatureProperties(
  assetId: string,
  layers: AgentLayer[],
): Record<string, unknown> | null {
  for (const layer of layers) {
    // symbology bakes colours into the drawn features, so the source features
    // are the attributes the asset actually has
    const features = (layer.sourceGeojson ?? layer.geojson).features ?? [];
    for (const feature of features) {
      if (feature.properties?.[ASSET_ID_PROPERTY] === assetId) return feature.properties;
    }
  }
  return null;
}

/** The picked feature's own rows, then the asset attributes it does not carry itself. */
export function withAssetProperties(
  rows: FeatureProp[],
  properties: Record<string, unknown> | null,
): FeatureProp[] {
  if (!properties) return rows;
  const known = new Set(rows.map((row) => row.id));
  const added = Object.entries(properties)
    .filter(([id]) => !known.has(id))
    .map(([id, value]) => toRow(id, value));
  return [...rows, ...added];
}
