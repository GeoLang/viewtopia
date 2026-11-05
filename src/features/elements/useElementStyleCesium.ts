import { useEffect, useRef } from 'react';
import type { Cesium3DTileset } from 'cesium';
import { repaintPickedTileFeature } from '../../hooks/useFeaturePickerCesium';
import { useTiles3dLayerStore } from '../../store/tiles3dLayers';
import { setTilesetStyleInputs } from '../../viewer/tilesetStyle';
import { useElementStore } from './store';

export function useElementStyleCesium() {
  const layerId = useElementStore((state) => state.model?.layerId);
  const selected = useElementStore((state) => state.selected);
  const hidden = useElementStore((state) => state.hidden);
  const isolated = useElementStore((state) => state.isolated);
  const loaded = useTiles3dLayerStore((state) => state.loaded);
  const styledRef = useRef<Cesium3DTileset | null>(null);

  useEffect(() => {
    const tileset = layerId === undefined ? undefined : loaded[layerId];
    const previous = styledRef.current;
    if (previous && previous !== tileset && !previous.isDestroyed()) {
      setTilesetStyleInputs(previous, { elements: undefined });
    }
    styledRef.current = tileset ?? null;
    if (!tileset || tileset.isDestroyed()) return;
    const nothingToStyle = selected.size === 0 && hidden.size === 0 && isolated === null;
    setTilesetStyleInputs(tileset, {
      elements: nothingToStyle ? undefined : { selected, hidden, isolated },
    });
    // Cesium re-evaluates every feature's colour for a new style, which takes off a colour set on one feature
    repaintPickedTileFeature();
  }, [layerId, selected, hidden, isolated, loaded]);
}
