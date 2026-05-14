import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Viewer,
  Cartesian3,
  Color,
  Entity,
} from 'cesium';
import { useBuildingStore } from '../store/buildings';
import { useAppStore } from '../store/app';

function parseColor(css: string): Color {
  try {
    return Color.fromCssColorString(css);
  } catch {
    return Color.fromCssColorString('#c8b896');
  }
}

export function useBuildingsCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const buildings = useBuildingStore((s) => s.buildings);
  const enabled = useBuildingStore((s) => s.enabled);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const entityRefs = useRef<Entity[]>([]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Remove old buildings
    for (const e of entityRefs.current) {
      viewer.entities.remove(e);
    }
    entityRefs.current = [];

    if (!enabled || buildings.length === 0) return;

    viewer.scene.globe.depthTestAgainstTerrain = true;

    for (const b of buildings) {
      const material = parseColor(b.color);
      const entity = viewer.entities.add({
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(b.coords),
          height: 0,
          extrudedHeight: b.height,
          material,
          outline: true,
          outlineColor: Color.BLACK.withAlpha(0.3),
          closeTop: true,
          closeBottom: true,
        },
        properties: b.tags as any,
      });
      entityRefs.current.push(entity);
    }
  }, [buildings, enabled, viewerRef, renderer, activeTab]);
}
