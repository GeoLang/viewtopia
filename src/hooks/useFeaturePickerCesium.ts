import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Viewer,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cesium3DTileFeature,
  defined,
} from 'cesium';
import type { Cartesian2 } from 'cesium';
import { useFeaturePickerStore, type FeatureProp } from '../store/featurePicker';

/**
 * Cesium binding for the feature picker (ported from vanilla feature-picker.js).
 * While the picker is enabled, a left click on a 3D Tiles feature reads its
 * properties into the store and highlights it; the original colour is restored
 * when another feature is picked or the picker is disabled.
 */
export function useFeaturePickerCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const highlightedRef = useRef<Cesium3DTileFeature | null>(null);
  const originalColorRef = useRef<Color | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const clearHighlight = () => {
      const f = highlightedRef.current;
      if (f) {
        f.color = originalColorRef.current ?? Color.WHITE;
        highlightedRef.current = null;
        originalColorRef.current = null;
      }
    };

    const enable = (v: Viewer) => {
      if (handlerRef.current) return;
      const handler = new ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((click: { position: Cartesian2 }) => {
        clearHighlight();
        const picked = v.scene.pick(click.position);
        if (defined(picked) && picked instanceof Cesium3DTileFeature) {
          const ids = picked.getPropertyIds();
          const rows: FeatureProp[] = ids.map((id) => {
            const val = picked.getProperty(id);
            return {
              id,
              value: typeof val === 'object' ? JSON.stringify(val) : String(val),
            };
          });
          useFeaturePickerStore.getState().setSelected(rows);
          originalColorRef.current = picked.color
            ? Color.clone(picked.color)
            : null;
          picked.color = Color.YELLOW.withAlpha(0.6);
          highlightedRef.current = picked;
        } else {
          useFeaturePickerStore.getState().setSelected(null);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
      handlerRef.current = handler;
    };

    const disable = () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
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
  }, [viewerRef]);
}
