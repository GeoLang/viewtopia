import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Color,
  Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  KeyboardEventModifier,
  Cesium3DTileFeature,
  defined,
} from 'cesium';
import type { Cartesian2, Cesium3DTileset } from 'cesium';
import { useBimModeStore } from '../features/bim/store';
import { elementIdOf, useElementStore } from '../features/elements/store';
import { SectionCapPick } from '../features/scene/sectionCut';
import { armedFaceClipTileset } from '../features/scene/tilesetSection';
import { assetFeatureProperties, withAssetProperties } from '../live/assetFeatures';
import { ASSET_ID_PROPERTY } from '../live/types';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import {
  useFeaturePickerStore,
  toRow,
  propsToRows,
  type FeatureProp,
} from '../store/featurePicker';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { tileHighlightColor } from '../viewer/tilesetStyle';

const HIGHLIGHT_COLOR = tileHighlightColor();

/**
 * The tile feature the picker painted. One Cesium picker runs at a time, so it
 * is held here rather than in the hook, where the asset rule can put the
 * highlight back after a style has repainted every feature.
 */
let highlighted: Cesium3DTileFeature | null = null;
let colorBeforeHighlight: Color | null = null;

export function repaintPickedTileFeature(): void {
  if (highlighted) highlighted.color = HIGHLIGHT_COLOR;
}

function withPtolemyAssetRows(rows: FeatureProp[], assetId: string): FeatureProp[] {
  const layers = useAgentLayerStore.getState().layers;
  return withAssetProperties(rows, assetFeatureProperties(assetId, layers));
}

/**
 * The rows one picked tile feature shows: its own properties, and under them the
 * attributes of the ptolemy asset with the same asset id.
 */
function tileFeatureRows(feature: Cesium3DTileFeature): FeatureProp[] {
  const rows = feature.getPropertyIds().map((id) => toRow(id, feature.getProperty(id)));
  const assetId = feature.getProperty(ASSET_ID_PROPERTY);
  if (typeof assetId !== 'string') return rows;
  return withPtolemyAssetRows(rows, assetId);
}

function layerDrawing(tileset: Cesium3DTileset) {
  const { layers, loaded } = useTiles3dLayerStore.getState();
  return layers.find((layer) => loaded[layer.id] === tileset);
}

function pickTileFeature(picked: Cesium3DTileFeature, additive: boolean): void {
  const elementId = elementIdOf(picked);
  const layer = layerDrawing(picked.tileset);
  if (elementId !== undefined && layer) {
    const elements = useElementStore.getState();
    elements.openModel(layer);
    elements.selectElement(elementId, { additive, fromScene: true });
  } else {
    colorBeforeHighlight = picked.color ? Color.clone(picked.color) : null;
    picked.color = HIGHLIGHT_COLOR;
    highlighted = picked;
  }
  // setSelected opens Feature Info, which replaces the panel showing this element
  if (useAppStore.getState().activePanel === 'modelElements' && elementId !== undefined) return;
  useFeaturePickerStore.getState().setSelected(tileFeatureRows(picked));
}

function pickSectionCap({ tileset, elementId }: SectionCapPick, additive: boolean): void {
  const layer = layerDrawing(tileset);
  if (!layer) throw new Error(`A section cap of element ${elementId} is drawn on a tileset no layer draws.`);
  const elements = useElementStore.getState();
  elements.openModel(layer);
  elements.selectElement(elementId, { additive, fromScene: true });
  if (useAppStore.getState().activePanel === 'modelElements') return;
  useFeaturePickerStore
    .getState()
    .setSelected(withPtolemyAssetRows([toRow(ASSET_ID_PROPERTY, elementId)], elementId));
}

/**
 * Cesium binding for the feature picker (ported from vanilla feature-picker.js).
 * While the picker is enabled, a left click reads the clicked feature's
 * properties into the store. 3D Tiles features are also highlighted, and the
 * original colour is restored when another feature is picked or the picker is
 * disabled. Vector entities (GeoJSON loaded by the agent or sql_query) carry
 * their properties in an entity property bag instead.
 */
export function useFeaturePickerCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // A renderer switch destroys and rebuilds the viewer, so rebind to the new
  // one — a handler left on the old canvas silently stops picking.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const clearHighlight = () => {
      if (highlighted) {
        highlighted.color = colorBeforeHighlight ?? Color.WHITE;
        highlighted = null;
        colorBeforeHighlight = null;
      }
    };

    const enable = (v: Viewer) => {
      if (handlerRef.current) return;
      const handler = new ScreenSpaceEventHandler(v.scene.canvas);
      const onClick = (position: Cartesian2, additive: boolean) => {
        if (armedFaceClipTileset()) return;
        // walking takes every left click as a floor to stand on
        if (useBimModeStore.getState().navigation === 'walk') return;
        clearHighlight();
        const picked = v.scene.pick(position);
        if (defined(picked) && picked instanceof Cesium3DTileFeature) {
          pickTileFeature(picked, additive);
          return;
        }
        if (defined(picked) && picked.id instanceof SectionCapPick) {
          pickSectionCap(picked.id, additive);
          return;
        }
        if (!additive) useElementStore.getState().clearSelection();
        if (defined(picked) && picked.id instanceof Entity) {
          const entity: Entity = picked.id;
          const bag = entity.properties?.getValue(v.clock.currentTime) ?? {};
          const rows: FeatureProp[] = propsToRows(bag);
          // GeoJSON entities usually carry `name` in the bag already; a second
          // row would duplicate it (and its React key).
          if (entity.name && !rows.some((r) => r.id === 'name')) {
            rows.unshift(toRow('name', entity.name));
          }
          useFeaturePickerStore
            .getState()
            .setSelected(rows.length > 0 ? rows : [toRow('(no properties)', '')]);
        } else {
          useFeaturePickerStore.getState().setSelected(null);
        }
      };
      handler.setInputAction((click: { position: Cartesian2 }) => {
        onClick(click.position, false);
      }, ScreenSpaceEventType.LEFT_CLICK);
      for (const modifier of [KeyboardEventModifier.SHIFT, KeyboardEventModifier.CTRL]) {
        handler.setInputAction(
          (click: { position: Cartesian2 }) => {
            onClick(click.position, true);
          },
          ScreenSpaceEventType.LEFT_CLICK,
          modifier,
        );
      }

      // Hover affordance — Cesium has no picking cursor of its own.
      handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
        const over = defined(v.scene.pick(movement.endPosition));
        v.scene.canvas.style.cursor = over ? 'pointer' : '';
      }, ScreenSpaceEventType.MOUSE_MOVE);

      handlerRef.current = handler;
    };

    const disable = () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        useElementStore.getState().clearSelection();
      }
      const v = viewerRef.current;
      if (v && !v.isDestroyed()) v.scene.canvas.style.cursor = '';
      clearHighlight();
    };

    // Apply the current state immediately, then react to changes.
    if (useFeaturePickerStore.getState().enabled) enable(viewer);

    const unsub = useFeaturePickerStore.subscribe((state) => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      if (state.enabled) enable(v);
      else disable();
    });

    return () => {
      unsub();
      disable();
    };
  }, [viewerRef, renderer, activeTab]);
}
