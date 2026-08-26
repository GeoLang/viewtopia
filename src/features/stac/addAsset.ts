/**
 * What an item's asset becomes on the map: the rule assetAction names, applied
 * for the browser panel's buttons and for the chat's stac.add_asset.
 */
import { toFeatureCollection, useAgentLayerStore } from '../../store/agentLayers';
import { loadPmtilesLayer, useOgcLayerStore } from '../../store/ogcLayers';
import { assetAction, fetchStac, type StacAsset } from './client';
import { useStacStore } from './store';

const ASSET_LAYER_COLOR = '#38bdf8';

/** The name an added asset carries, which is also what a failure is reported under. */
export function assetLayerName(itemId: string, asset: StacAsset): string {
  return `${itemId} ${asset.key}`;
}

/** Add one asset the way its kind asks for, answering what to show about it. */
export async function addStacAsset(itemId: string, asset: StacAsset): Promise<string> {
  const action = assetAction(asset);
  const name = assetLayerName(itemId, asset);
  if (action === null) throw new Error('the viewer cannot draw this asset');
  if (action === 'raster') {
    useStacStore.getState().openInRasterAnalysis(asset.href);
    return `${name} is open in raster analysis.`;
  }
  if (action === 'tiles') {
    useOgcLayerStore.getState().addXyzLayer(name, asset.href);
    return `Added ${name} as tiles.`;
  }
  if (action === 'pmtiles') {
    const archive = useOgcLayerStore.getState().addLayer(name, asset.href, 'pmtiles');
    try {
      const info = await loadPmtilesLayer(archive);
      return `${name}: ${info.kind}, zoom ${info.minZoom}–${info.maxZoom}`;
    } catch (failure) {
      useOgcLayerStore.getState().removeLayer(archive.id);
      throw failure;
    }
  }
  const geojson = toFeatureCollection(await fetchStac(asset.href));
  if (!geojson || geojson.features.length === 0) throw new Error('the asset holds no features');
  useAgentLayerStore
    .getState()
    .addLayer({ id: crypto.randomUUID(), name, color: ASSET_LAYER_COLOR, geojson }, true);
  return `${name}: ${geojson.features.length} features`;
}
