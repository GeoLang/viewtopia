import { useEffect } from 'react';
import { useCesium } from '../hooks/useCesium';
import { useMapLibre } from '../hooks/useMapLibre';
import { useAgentLayersCesium } from '../hooks/useAgentLayersCesium';
import { useAgentLayersMapLibre } from '../hooks/useAgentLayersMapLibre';
import type { Pane } from '../store/splitView';

/**
 * A split view pane beside the viewer. Mounted only while the split is on, so
 * unmounting is what tears the renderer down: the hooks destroy their instance
 * (and its WebGL context) on unmount.
 *
 * The pane draws its own basemap and the agent's layers. Everything else a tool
 * can add (Ion tilesets, terrain, OGC services, draw and measure) acts on the
 * one registered viewer, which stays the left pane.
 */
export function SplitPane({ pane }: { pane: Pane }) {
  const cesiumRef = useCesium({ containerId: 'cesium-pane', pane });
  const maplibreRef = useMapLibre({ containerId: 'maplibre-pane', pane });

  useAgentLayersCesium(cesiumRef);
  useAgentLayersMapLibre(maplibreRef);

  // the pane's own renderer switch reveals a container that was display:none
  useEffect(() => {
    const timer = setTimeout(() => {
      const viewer = cesiumRef.current;
      if (viewer && !viewer.isDestroyed()) viewer.resize();
      maplibreRef.current?.resize();
    }, 150);
    return () => clearTimeout(timer);
  }, [pane.renderer, cesiumRef, maplibreRef]);

  return (
    <>
      <div
        id="cesium-pane"
        style={{
          position: 'absolute',
          inset: 0,
          display: pane.renderer === 'cesium' ? 'block' : 'none',
        }}
      />
      <div
        id="maplibre-pane"
        style={{
          position: 'absolute',
          inset: 0,
          display: pane.renderer === 'maplibre' ? 'block' : 'none',
        }}
      />
    </>
  );
}
