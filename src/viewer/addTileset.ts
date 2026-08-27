/**
 * A 3D tileset joining the globe from its url. The agent's load_tileset command
 * and the chat's data.add_tileset action both come through here, so a tileset
 * added either way is loaded and flown to the same.
 */
import { loadedTileset, useTiles3dLayerStore } from '../store/tiles3dLayers';
import { getActiveCesiumViewer } from './registry';

export const DEFAULT_TILESET_NAME = 'Tileset';

export interface AddedTileset {
  name: string;
  /** what stopped it, null once the tiles are drawn and the camera has flown */
  failure: string | null;
}

export async function addTilesetToGlobe(url: string, wanted?: string): Promise<AddedTileset> {
  const name = wanted ?? DEFAULT_TILESET_NAME;
  const viewer = getActiveCesiumViewer();
  if (!viewer) {
    return {
      name,
      failure: 'there is no Cesium globe on screen, so set the renderer to cesium first',
    };
  }
  const id = crypto.randomUUID();
  // the layer row stays behind on a failed load, since it is what says why
  useTiles3dLayerStore.getState().putLayer({ id, name, url, visible: true });
  const tileset = await loadedTileset(id);
  if (!tileset) {
    return { name, failure: `${name} did not load, see its layer row` };
  }
  await viewer.flyTo(tileset);
  return { name, failure: null };
}
