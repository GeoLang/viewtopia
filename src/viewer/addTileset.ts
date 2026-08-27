/**
 * A 3D tileset joining the globe from its url. The agent's load_tileset command
 * and the chat's data.add_tileset action both come through here, so a tileset
 * added either way is loaded and flown to the same.
 */
import { loadedTileset, useTiles3dLayerStore } from '../store/tiles3dLayers';
import { getActiveCesiumViewer } from './registry';

export const DEFAULT_TILESET_NAME = 'Tileset';

/**
 * How long the chat waits for the tiles before it answers. Shorter than the
 * panel's wait because a chat turn that says nothing for a minute reads as a
 * hung viewer, and the layer row goes on loading either way.
 */
export const CHAT_TILESET_WAIT_SECONDS = 15;

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Why nothing drew. A chat reply and a notification word the same cause
 * differently, so the wording is left to whichever one is asking.
 */
export type TilesetFailure = 'no-globe' | 'not-drawn';

export interface AddedTileset {
  name: string;
  /** null once the tiles are drawn and the camera has flown */
  failure: TilesetFailure | null;
}

export async function addTilesetToGlobe(url: string, wanted?: string): Promise<AddedTileset> {
  const name = wanted ?? DEFAULT_TILESET_NAME;
  const viewer = getActiveCesiumViewer();
  if (!viewer) {
    return { name, failure: 'no-globe' };
  }
  const id = crypto.randomUUID();
  // the layer row stays behind on a failed load, since it is what says why
  useTiles3dLayerStore.getState().putLayer({ id, name, url, visible: true });
  const tileset = await loadedTileset(id, CHAT_TILESET_WAIT_SECONDS * MILLISECONDS_PER_SECOND);
  if (!tileset) {
    return { name, failure: 'not-drawn' };
  }
  await viewer.flyTo(tileset);
  return { name, failure: null };
}
