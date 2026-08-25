import { useEffect, useRef } from 'react';
import { Cesium3DTileStyle, type Cesium3DTileset } from 'cesium';
import {
  useAssetStateStore,
  colorForAsset,
  visibleAssets,
  type AssetState,
} from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ASSET_ID_PROPERTY, ASSET_RULE_ID, type AssetRule } from '../live/types';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { repaintPickedTileFeature } from './useFeaturePickerCesium';

/** What a tile feature no asset names keeps, when the tileset had no colour of its own. */
const DEFAULT_TILE_COLOR = 'color("white")';

/** The colour expression the tileset painted before the rule took it over. */
function fallbackColor(style: Cesium3DTileStyle | undefined): string {
  const color = (style?.style as { color?: unknown } | undefined)?.color;
  return typeof color === 'string' ? color : DEFAULT_TILE_COLOR;
}

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

/** What the tileset the rule names was styled with before we wrote over it. */
interface StyledTileset {
  tileset: Cesium3DTileset;
  previous: Cesium3DTileStyle | undefined;
}

function restore(styled: StyledTileset | null): void {
  if (!styled || styled.tileset.isDestroyed()) return;
  styled.tileset.style = styled.previous;
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
  const styledRef = useRef<StyledTileset | null>(null);

  useEffect(() => {
    const tileset = rule ? loaded[rule.layerId] : undefined;
    const styled = styledRef.current;
    if (styled && styled.tileset !== tileset) {
      restore(styled);
      styledRef.current = null;
    }
    if (!rule || !tileset || tileset.isDestroyed()) return;
    const previous = styledRef.current?.previous ?? tileset.style;
    tileset.style = new Cesium3DTileStyle({
      color: { conditions: assetColorConditions(rule, assets, fallbackColor(previous)) },
    });
    styledRef.current = { tileset, previous };
    // a new style re-evaluates every feature's colour, which takes the picker's
    // highlight off the feature under it
    repaintPickedTileFeature();
  }, [rule, assets, loaded]);

  useEffect(
    () => () => {
      restore(styledRef.current);
      styledRef.current = null;
    },
    [],
  );
}
