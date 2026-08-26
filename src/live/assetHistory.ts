/**
 * Showing every asset as it stood at one past moment. The scrubber asks for a
 * moment as it is dragged and the chat asks for one by name.
 */

import { assetsAt } from './api';
import { useAssetStateStore } from './assetState';
import type { AssetSnapshot } from './types';

/** the moment whose answer we would still take, so a slow one cannot win */
let latestRequested: string | null = null;

/**
 * Read every asset's state at an RFC 3339 moment and put it on the map. Answers
 * how many assets it showed, or 0 when a later moment was asked for meanwhile:
 * that answer, and its failure, are dropped.
 */
export async function showAssetsAt(documentId: string, at: string): Promise<number> {
  latestRequested = at;
  let assets: AssetSnapshot[];
  try {
    assets = await assetsAt(documentId, at);
  } catch (failure) {
    if (latestRequested !== at) return 0;
    throw failure;
  }
  if (latestRequested !== at) return 0;
  useAssetStateStore.getState().showHistory(at, assets);
  return assets.length;
}

/** Follow the live feed again, dropping any answer still on its way. */
export function showLiveAssets(): void {
  latestRequested = null;
  useAssetStateStore.getState().showLive();
}
