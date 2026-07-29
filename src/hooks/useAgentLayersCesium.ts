import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  GeoJsonDataSource,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import { useAgentLayerStore, layerStyle } from '../store/agentLayers';
import { useAppStore } from '../store/app';

const PREFIX = 'agent-layer-';
const MARKER_PREFIX = 'agent-marker-';

/** Draws the agent's ui_spec layers and markers on Cesium, re-applying after a renderer switch. */
export function useAgentLayersCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const layers = useAgentLayerStore((s) => s.layers);
  const markers = useAgentLayerStore((s) => s.markers);
  const generation = useAgentLayerStore((s) => s.generation);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const framedRef = useRef(-1);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // drop our markers, then redraw from the store
    for (const e of viewer.entities.values.filter((e) => e.id.startsWith(MARKER_PREFIX))) {
      viewer.entities.remove(e);
    }
    for (const m of markers) {
      viewer.entities.add({
        id: `${MARKER_PREFIX}${m.id}`,
        position: Cartesian3.fromDegrees(m.lon, m.lat),
        point: { pixelSize: 10, color: Color.fromCssColorString(m.color) },
        label: m.label
          ? {
              text: m.label,
              font: '14px sans-serif',
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -12),
            }
          : undefined,
      });
    }
  }, [markers, viewerRef, renderer, activeTab]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;

    const apply = async () => {
      for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
        const ds = viewer.dataSources.get(i);
        if (ds.name?.startsWith(PREFIX)) viewer.dataSources.remove(ds);
      }

      let last: GeoJsonDataSource | undefined;
      for (const layer of layers) {
        const style = layerStyle(layer);
        const color = Color.fromCssColorString(layer.color);
        const ds = await GeoJsonDataSource.load(layer.geojson, {
          stroke: style.stroked ? color : color.withAlpha(0),
          fill: color.withAlpha(style.filled ? style.opacity : 0),
          strokeWidth: style.lineWidth,
          markerColor: color,
        });
        if (cancelled || viewer.isDestroyed()) return;
        ds.name = `${PREFIX}${layer.id}`;
        await viewer.dataSources.add(ds);
        last = ds;
      }

      // Frame only when a new spec arrives, never on a plain renderer switch.
      if (last && framedRef.current !== generation) {
        framedRef.current = generation;
        await viewer.flyTo(last).catch(() => undefined);
      }
    };

    void apply();
    return () => {
      cancelled = true;
    };
  }, [layers, generation, viewerRef, renderer, activeTab]);
}
