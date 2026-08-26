/**
 * Adding an OGC service as a layer, for the services tab and for the chat's
 * data.add_service.
 */
import {
  loadPmtilesLayer,
  loadWfsLayer,
  useOgcLayerStore,
  type OGCType,
} from '../../store/ogcLayers';

/** A tileset comes from the server's own builder, so nobody adds one by URL. */
export type AddableServiceType = Exclude<OGCType, 'tileset'>;

export const SERVICE_TYPE_LABELS: Record<AddableServiceType, string> = {
  wms: 'WMS',
  wmts: 'WMTS',
  wfs: 'WFS',
  xyz: 'XYZ Tiles',
  pmtiles: 'PMTiles',
};

export const ADDABLE_SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS) as AddableServiceType[];

/**
 * Add the service and, for the two kinds that are requests rather than tile
 * templates, load it. Answers what to show about it. A failed request takes the
 * layer back off and throws.
 */
export async function addOgcService(
  name: string,
  url: string,
  type: AddableServiceType,
): Promise<string> {
  const layer = useOgcLayerStore.getState().addLayer(name, url, type);
  if (layer.type !== 'wfs' && layer.type !== 'pmtiles') return `Added ${layer.name}`;
  try {
    if (layer.type === 'pmtiles') {
      const info = await loadPmtilesLayer(layer);
      return `${layer.name}: ${info.kind}, zoom ${info.minZoom}–${info.maxZoom}`;
    }
    return `${layer.name}: ${await loadWfsLayer(layer)} features`;
  } catch (failure) {
    useOgcLayerStore.getState().removeLayer(layer.id);
    throw failure;
  }
}
