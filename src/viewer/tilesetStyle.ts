import { Cesium3DTileStyle, Color } from 'cesium';
import type { Cesium3DTile, Cesium3DTileFeature, Cesium3DTileset, StyleExpression } from 'cesium';
import { elementIdOf } from '../features/elements/store';
import { ASSET_ID_PROPERTY } from '../live/types';

const TILE_HIGHLIGHT_ALPHA = 0.6;

export function tileHighlightColor(): Color {
  return Color.YELLOW.withAlpha(TILE_HIGHLIGHT_ALPHA);
}

export interface TileStyleDefinition {
  color?: string | { conditions: string[][] };
  pointSize?: string;
}

export interface ElementStyle {
  selected: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  isolated: ReadonlySet<string> | null;
  failed?: ReadonlySet<string>;
  suppressed?: ReadonlySet<string>;
}

export interface TilesetStyleInputs {
  base?: TileStyleDefinition;
  assetColorConditions?: (fallbackColor: string | undefined) => string[][];
  elements?: ElementStyle;
}

const inputsByTileset = new WeakMap<Cesium3DTileset, TilesetStyleInputs>();

export type ElementIdColumn = 'present' | 'absent' | 'not loaded';

function elementIdColumnUnder(tile: Cesium3DTile): ElementIdColumn {
  // cesium 1.147 leaves content undefined on a tile with a content uri until it loads, and again after it unloads
  const content: Cesium3DTile['content'] | undefined = tile.content;
  const meshLoaded =
    content !== undefined && (content.featuresLength > 0 || content.trianglesLength > 0);
  if (content !== undefined && content.featuresLength > 0 && content.hasProperty(0, ASSET_ID_PROPERTY)) {
    return 'present';
  }
  let column: ElementIdColumn = meshLoaded ? 'absent' : 'not loaded';
  for (const child of tile.children) {
    const childColumn = elementIdColumnUnder(child);
    if (childColumn === 'present') return childColumn;
    if (childColumn === 'absent') column = childColumn;
  }
  return column;
}

export function elementIdColumn(tileset: Cesium3DTileset): ElementIdColumn {
  return elementIdColumnUnder(tileset.root);
}

function definitionWithAssetColors({
  base,
  assetColorConditions,
}: TilesetStyleInputs): TileStyleDefinition | undefined {
  if (!assetColorConditions) return base;
  const fallbackColor = typeof base?.color === 'string' ? base.color : undefined;
  return { ...base, color: { conditions: assetColorConditions(fallbackColor) } };
}

const IDS_FAILURE = Color.RED.withAlpha(TILE_HIGHLIGHT_ALPHA);

function styleElements(style: Cesium3DTileStyle, { selected, hidden, isolated, failed, suppressed }: ElementStyle): void {
  const baseShow: StyleExpression | undefined = style.show;
  const baseColor: StyleExpression | undefined = style.color;
  const highlight = tileHighlightColor();

  // cesium's Model.applyColorAndShow evaluates the style with no feature for a tile without a feature table
  const isShown = (feature: Cesium3DTileFeature | undefined): boolean => {
    const id = feature ? elementIdOf(feature) : undefined;
    if (id !== undefined && (hidden.has(id) || suppressed?.has(id))) return false;
    if (isolated && (id === undefined || !isolated.has(id))) return false;
    return baseShow && feature ? Boolean(baseShow.evaluate(feature)) : true;
  };
  const colorOf = (feature: Cesium3DTileFeature | undefined, result?: Color): Color => {
    const id = feature ? elementIdOf(feature) : undefined;
    if (id !== undefined && selected.has(id)) return Color.clone(highlight, result);
    if (id !== undefined && failed?.has(id)) return Color.clone(IDS_FAILURE, result);
    return baseColor && feature
      ? baseColor.evaluateColor(feature, result)
      : Color.clone(Color.WHITE, result);
  };

  // Cesium3DTileStyle documents custom show and color objects, and its expression language has no set lookup
  style.show = {
    evaluate: isShown,
    evaluateColor: (_feature, result) => Color.clone(Color.WHITE, result),
  };
  style.color = { evaluate: colorOf, evaluateColor: colorOf };
}

function composedStyle(inputs: TilesetStyleInputs): Cesium3DTileStyle | undefined {
  const definition = definitionWithAssetColors(inputs);
  if (!definition && !inputs.elements) return undefined;
  const style = new Cesium3DTileStyle(definition);
  if (inputs.elements) styleElements(style, inputs.elements);
  return style;
}

export function setTilesetStyleInputs(tileset: Cesium3DTileset, changes: TilesetStyleInputs): void {
  const inputs = { ...inputsByTileset.get(tileset), ...changes };
  inputsByTileset.set(tileset, inputs);
  tileset.style = composedStyle(inputs);
}
