import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Color, GeoJsonDataSource, Viewer } from 'cesium';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';

const PREFIX = 'agent-layer-';

/** Draws the agent's ui_spec layers on Cesium, re-applying after a renderer switch. */
export function useAgentLayersCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const layers = useAgentLayerStore((s) => s.layers);
  const generation = useAgentLayerStore((s) => s.generation);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const framedRef = useRef(-1);

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
        const ds = await GeoJsonDataSource.load(layer.geojson, {
          stroke: Color.fromCssColorString(layer.color),
          fill: Color.fromCssColorString(layer.color).withAlpha(0.3),
          strokeWidth: 2,
          markerColor: Color.fromCssColorString(layer.color),
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
