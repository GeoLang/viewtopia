import { useEffect, useRef } from 'react';
import type { Cesium3DTileset } from 'cesium';
import {
  useAssetStateStore,
  colorForAsset,
  visibleAssets,
  type AssetState,
} from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ASSET_ID_PROPERTY, ASSET_RULE_ID, type AssetRule } from '../live/types';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { setTilesetStyleInputs } from '../viewer/tilesetStyle';
import { repaintPickedTileFeature } from './useFeaturePickerCesium';

/** What a tile feature no asset names keeps, when the tileset had no colour of its own. */
const DEFAULT_TILE_COLOR = 'color("white")';

/**
 * The rule's colours as a 3D Tiles style: one condition per asset the store
 * knows, matched on the tile feature's asset id, and everything else keeps the
 * colour the tileset already had. Cesium takes the first condition that holds,
 * so the fallback goes last.
 */
export function assetColorConditions(
  rule: AssetRule,
  assets: Record<string, AssetState>,
  fallback: string = DEFAULT_TILE_COLOR,
): string[][] {
  const conditions = Object.entries(assets).map(([assetId, asset]) => [
    `\${${ASSET_ID_PROPERTY}} === ${JSON.stringify(assetId)}`,
    `color(${JSON.stringify(colorForAsset(rule, asset))})`,
  ]);
  conditions.push(['true', fallback]);
  return conditions;
}

function dropAssetColors(tileset: Cesium3DTileset | null): void {
  if (!tileset || tileset.isDestroyed()) return;
  setTilesetStyleInputs(tileset, { assetColorConditions: undefined });
}

/**
 * Recolours the tile features of the 3D tileset the document's threshold rule
 * names, from the readings the asset store holds. Dropping the rule puts the
 * tileset's own style back.
 */
export function useAssetColorsCesium() {
  const rule = useLiveStore((state) => state.document.assets[ASSET_RULE_ID]);
  const assets = useAssetStateStore(visibleAssets);
  const loaded = useTiles3dLayerStore((state) => state.loaded);
  const styledRef = useRef<Cesium3DTileset | null>(null);

  useEffect(() => {
    const tileset = rule ? loaded[rule.layerId] : undefined;
    if (styledRef.current && styledRef.current !== tileset) {
      dropAssetColors(styledRef.current);
      styledRef.current = null;
    }
    if (!rule || !tileset || tileset.isDestroyed()) return;
    setTilesetStyleInputs(tileset, {
      assetColorConditions: (fallback) => assetColorConditions(rule, assets, fallback),
    });
    styledRef.current = tileset;
    // a new style re-evaluates every feature's colour, which takes the picker's
    // highlight off the feature under it
    repaintPickedTileFeature();
  }, [rule, assets, loaded]);

  useEffect(
    () => () => {
      dropAssetColors(styledRef.current);
      styledRef.current = null;
    },
    [],
  );
}
