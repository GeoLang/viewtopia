import { useEffect } from 'react';
import { useCesium } from '../hooks/useCesium';
import { useMapLibre } from '../hooks/useMapLibre';
import { useAgentLayersCesium } from '../hooks/useAgentLayersCesium';
import { useAgentLayersMapLibre } from '../hooks/useAgentLayersMapLibre';
import type { Pane, SplitLayout } from '../store/splitView';

/**
 * A split view pane beside the viewer. Mounted only while the split is on, so
 * unmounting is what tears the renderer down: the hooks destroy their instance
 * (and its WebGL context) on unmount.
 *
 * The pane draws its own basemap and the agent's layers. Everything else a tool
 * can add (Ion tilesets, terrain, OGC services, draw and measure) acts on the
 * one registered viewer, which stays the top left pane.
 */
export function SplitPane({
  pane,
  index,
  layout,
}: {
  pane: Pane;
  index: number;
  layout: SplitLayout;
}) {
  const cesiumId = `cesium-pane-${index}`;
  const maplibreId = `maplibre-pane-${index}`;
  const cesiumRef = useCesium({ containerId: cesiumId, pane, paneIndex: index });
  const maplibreRef = useMapLibre({ containerId: maplibreId, pane, paneIndex: index });

  useAgentLayersCesium(cesiumRef);
  useAgentLayersMapLibre(maplibreRef);

  // the pane's own renderer switch reveals a container that was display:none,
  // and every layout change resizes the box this pane sits in
  useEffect(() => {
    const timer = setTimeout(() => {
      const viewer = cesiumRef.current;
      if (viewer && !viewer.isDestroyed()) viewer.resize();
      maplibreRef.current?.resize();
    }, 150);
    return () => clearTimeout(timer);
  }, [pane.renderer, layout, cesiumRef, maplibreRef]);

  return (
    <>
      <div
        id={cesiumId}
        style={{
          position: 'absolute',
          inset: 0,
          display: pane.renderer === 'cesium' ? 'block' : 'none',
        }}
      />
      <div
        id={maplibreId}
        style={{
          position: 'absolute',
          inset: 0,
          display: pane.renderer === 'maplibre' ? 'block' : 'none',
        }}
      />
    </>
  );
}
