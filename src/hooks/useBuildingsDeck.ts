import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { PolygonLayer } from '@deck.gl/layers';
import { useBuildingStore, type BuildingFeature } from '../store/buildings';
import { useAppStore } from '../store/app';

function hexToRgba(hex: string): [number, number, number, number] {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 200];
  } catch {
    return [200, 184, 150, 200];
  }
}

interface BuildingDatum {
  polygon: [number, number][];
  height: number;
  color: [number, number, number, number];
}

export function useBuildingsDeck(
  overlayRef: MutableRefObject<MapboxOverlay | null>,
) {
  const buildings = useBuildingStore((s) => s.buildings);
  const enabled = useBuildingStore((s) => s.enabled);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (!enabled || buildings.length === 0) {
      // Remove building layers, keep spacetime layers
      const existing = (overlay as any)._props?.layers ?? [];
      const filtered = existing.filter((l: any) => l.id !== 'osm-buildings');
      overlay.setProps({ layers: filtered });
      return;
    }

    // Convert flat coords array to polygon ring
    const data: BuildingDatum[] = buildings.map((b) => {
      const ring: [number, number][] = [];
      for (let i = 0; i < b.coords.length; i += 2) {
        ring.push([b.coords[i], b.coords[i + 1]]);
      }
      return {
        polygon: ring,
        height: b.height,
        color: hexToRgba(b.color),
      };
    });

    const buildingLayer = new PolygonLayer<BuildingDatum>({
      id: 'osm-buildings',
      data,
      getPolygon: (d) => d.polygon,
      getElevation: (d) => d.height,
      getFillColor: (d) => d.color,
      getLineColor: [0, 0, 0, 80],
      getLineWidth: 1,
      extruded: true,
      wireframe: true,
      pickable: true,
    });

    // Merge with existing layers (keep spacetime layers)
    const existing = (overlay as any)._props?.layers ?? [];
    const otherLayers = existing.filter((l: any) => l.id !== 'osm-buildings');
    overlay.setProps({ layers: [...otherLayers, buildingLayer] });
  }, [buildings, enabled, overlayRef, renderer, activeTab]);
}
