import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Color,
  Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cesium3DTileFeature,
  defined,
} from 'cesium';
import type { Cartesian2 } from 'cesium';
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

const HIGHLIGHT_COLOR = Color.YELLOW.withAlpha(0.6);

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

/**
 * The rows one picked tile feature shows: its own properties, and under them the
 * attributes of the ptolemy asset with the same asset id.
 */
function tileFeatureRows(feature: Cesium3DTileFeature): FeatureProp[] {
  const rows = feature.getPropertyIds().map((id) => toRow(id, feature.getProperty(id)));
  const assetId = feature.getProperty(ASSET_ID_PROPERTY);
  if (typeof assetId !== 'string') return rows;
  const layers = useAgentLayerStore.getState().layers;
  return withAssetProperties(rows, assetFeatureProperties(assetId, layers));
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
      handler.setInputAction((click: { position: Cartesian2 }) => {
        clearHighlight();
        const picked = v.scene.pick(click.position);
        if (defined(picked) && picked instanceof Cesium3DTileFeature) {
          useFeaturePickerStore.getState().setSelected(tileFeatureRows(picked));
          colorBeforeHighlight = picked.color ? Color.clone(picked.color) : null;
          picked.color = HIGHLIGHT_COLOR;
          highlighted = picked;
        } else if (defined(picked) && picked.id instanceof Entity) {
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
      }, ScreenSpaceEventType.LEFT_CLICK);

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
