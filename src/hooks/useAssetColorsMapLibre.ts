import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import {
  useAssetStateStore,
  colorForAsset,
  visibleAssets,
  type AssetState,
} from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ASSET_ID_PROPERTY, ASSET_RULE_ID, type AssetRule } from '../live/types';

const PREFIX = 'agent-layer-';

/** The layers useAgentLayersMapLibre adds per source, and the colour each paints. */
const COLOR_PAINT = [
  { suffix: '-fill', property: 'fill-color' },
  { suffix: '-line', property: 'line-color' },
  { suffix: '-circle', property: 'circle-color' },
] as const;

/** What one layer painted before the rule took it over, and what we left there. */
interface PaintedLayer {
  property: string;
  original: unknown;
  applied: unknown;
}

type PaintedLayers = Map<string, PaintedLayer>;

const sameValue = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * The rule's colours as one paint expression: every asset the store knows maps
 * to its own colour, and anything else keeps what the layer already painted.
 */
export function assetColorExpression(
  rule: AssetRule,
  assets: Record<string, AssetState>,
  fallback: unknown,
): unknown {
  const entries = Object.entries(assets);
  // a match needs at least one branch, so with nothing to colour the layer stays as it was
  if (entries.length === 0) return fallback;
  const match: unknown[] = ['match', ['get', ASSET_ID_PROPERTY]];
  for (const [assetId, asset] of entries) match.push(assetId, colorForAsset(rule, asset));
  match.push(fallback);
  return match;
}

function applyPaint(
  map: maplibregl.Map,
  rule: AssetRule,
  assets: Record<string, AssetState>,
  painted: PaintedLayers,
): void {
  for (const { suffix, property } of COLOR_PAINT) {
    const layerId = `${PREFIX}${rule.layerId}${suffix}`;
    if (!map.getLayer(layerId)) continue;
    const current: unknown = map.getPaintProperty(layerId, property);
    const known = painted.get(layerId);
    // the agent layer effect re-adds its layers, which puts the layer's own
    // colour back, so anything we did not write is the original
    const original = known && sameValue(current, known.applied) ? known.original : current;
    const next = assetColorExpression(rule, assets, original);
    if (!sameValue(next, current)) map.setPaintProperty(layerId, property, next);
    painted.set(layerId, { property, original, applied: next });
  }
}

function restorePaint(map: maplibregl.Map, painted: PaintedLayers): void {
  for (const [layerId, { property, original, applied }] of painted) {
    if (!map.getLayer(layerId)) continue;
    if (!sameValue(map.getPaintProperty(layerId, property), applied)) continue;
    map.setPaintProperty(layerId, property, original);
  }
  painted.clear();
}

/**
 * Recolours the asset layer from the document's threshold rule and the readings
 * the asset store holds. Nothing is written back: the agent layer keeps its own
 * features and colour, and dropping the rule puts that colour back.
 */
export function useAssetColorsMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const rule = useLiveStore((state) => state.document.assets[ASSET_RULE_ID]);
  const assets = useAssetStateStore(visibleAssets);
  const map = mapRef.current;
  const paintedRef = useRef<PaintedLayers>(new Map());

  useEffect(() => {
    if (!map) return;
    const painted = paintedRef.current;
    if (!rule) {
      restorePaint(map, painted);
      return;
    }
    const apply = () => applyPaint(map, rule, assets, painted);
    apply();
    // useAgentLayersMapLibre re-adds its layers whenever the store or the
    // basemap style changes, which puts the layer's own colour back. Every
    // re-add renders, so idle is where the rule's colours go on again.
    map.on('idle', apply);
    return () => {
      map.off('idle', apply);
    };
  }, [map, rule, assets]);

  useEffect(() => {
    if (!map) return;
    const painted = paintedRef.current;
    return () => restorePaint(map, painted);
  }, [map]);
}
