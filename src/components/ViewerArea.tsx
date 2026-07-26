import { useEffect, useCallback } from 'react';
import { Box } from '@mantine/core';
import { Cartesian3 } from 'cesium';
import { useAppStore } from '../store/app';
import { useSplitViewStore } from '../store/splitView';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { useCesium } from '../hooks/useCesium';
import { useDeckGL } from '../hooks/useDeckGL';
import { useMapLibre } from '../hooks/useMapLibre';
import { useLeaflet } from '../hooks/useLeaflet';
import { useSpaceTimeTracks } from '../hooks/useSpaceTimeTracks';
import { useSpaceTimeDeckLayers } from '../hooks/useSpaceTimeDeckLayers';
import { useSpaceTimeCesium } from '../hooks/useSpaceTimeCesium';
import { useBuildingsCesium } from '../hooks/useBuildingsCesium';
import { useBuildingsDeck } from '../hooks/useBuildingsDeck';
import { useBuildingsMapLibre } from '../hooks/useBuildingsMapLibre';
import { useAgentLayersCesium } from '../hooks/useAgentLayersCesium';
import { useAgentLayersDeck } from '../hooks/useAgentLayersDeck';
import { useAgentLayersMapLibre } from '../hooks/useAgentLayersMapLibre';
import { useOgcLayersCesium } from '../hooks/useOgcLayersCesium';
import { useOgcLayersMapLibre } from '../hooks/useOgcLayersMapLibre';
import { useDrawCesium } from '../hooks/useDrawCesium';
import { useDrawMapLibre } from '../hooks/useDrawMapLibre';
import { useMeasureCesium } from '../hooks/useMeasureCesium';
import { useFeaturePickerCesium } from '../hooks/useFeaturePickerCesium';
import { useFeaturePickerMapLibre } from '../hooks/useFeaturePickerMapLibre';
import { useMeasureMapLibre } from '../hooks/useMeasureMapLibre';
import { useShareLinkHash } from '../hooks/useShareLinkHash';
import { Minimap } from './Minimap';
import { CoordReadout } from './CoordReadout';
import { ContextMenu } from './ContextMenu';
import { SplitPane } from './SplitPane';

export function ViewerArea() {
  const { activeTab, renderer } = useAppStore();
  const splitActive = useSplitViewStore((s) => s.active);
  const paneRenderer = useSplitViewStore((s) => s.paneRenderer);
  // the second pane is a globe renderer, so the 2D map tab stays single
  const split = splitActive && activeTab === 'globe';
  const setCursorCoords = useAppStore((s) => s.setCursorCoords);
  const showContextMenu = useAppStore((s) => s.showContextMenu);
  const hideContextMenu = useAppStore((s) => s.hideContextMenu);
  const flyToTarget = useSpaceTimeStore((s) => s.flyToTarget);
  const clearFlyTo = useSpaceTimeStore((s) => s.clearFlyTo);

  // Initialize all viewer engines (they mount into DOM containers below)
  const cesiumRef = useCesium({ containerId: 'cesium-container' });
  const {
    deckRef,
    flyTo: deckFlyTo,
    fitBounds: deckFitBounds,
  } = useDeckGL({ containerId: 'deckgl-container' });
  const maplibreRef = useMapLibre({ containerId: 'maplibre-container' });
  const leafletRef = useLeaflet({ containerId: 'leaflet-container' });

  // Render spacetime tracks on all renderers
  useSpaceTimeTracks(maplibreRef);
  useSpaceTimeDeckLayers();
  useSpaceTimeCesium(cesiumRef);

  // Render OSM buildings on all 3D renderers
  useBuildingsCesium(cesiumRef);
  useBuildingsDeck();
  useBuildingsMapLibre(maplibreRef);

  // Render the agent's ui_spec layers on whichever globe renderer is active
  useAgentLayersCesium(cesiumRef);
  useAgentLayersDeck(deckFitBounds);
  useAgentLayersMapLibre(maplibreRef);

  // OGC/XYZ services the user added (raster imagery; no deck.gl equivalent)
  useOgcLayersCesium(cesiumRef);
  useOgcLayersMapLibre(maplibreRef);

  // Drawing tools (Cesium + MapLibre; deck.gl is a standalone Deck, not a map)
  useDrawCesium(cesiumRef);
  useDrawMapLibre(maplibreRef);

  // Measurement tools (Cesium + MapLibre)
  useMeasureCesium(cesiumRef);
  useMeasureMapLibre(maplibreRef);

  // Feature picker — inspect clicked features (deck.gl binds via useDeckGL,
  // since picking is a Deck-level prop)
  useFeaturePickerCesium(cesiumRef);
  useFeaturePickerMapLibre(maplibreRef);

  // Apply camera + renderer from a shared-link URL hash once on mount
  useShareLinkHash();

  // React to flyTo requests from spacetime store
  useEffect(() => {
    if (!flyToTarget) return;
    const { lng, lat, zoom } = flyToTarget;

    // Guard against invalid coordinates
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      clearFlyTo();
      return;
    }

    const altitude = zoom ? 4e7 / Math.pow(2, zoom) : 5_000_000;

    if (activeTab === 'globe') {
      if (renderer === 'cesium' && cesiumRef.current && !cesiumRef.current.isDestroyed()) {
        cesiumRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(lng, lat, altitude),
          duration: 1.5,
        });
      } else if (renderer === 'deckgl') {
        deckFlyTo(lng, lat, zoom);
      } else if (renderer === 'maplibre' && maplibreRef.current) {
        maplibreRef.current.flyTo({ center: [lng, lat], zoom: zoom ?? 8, duration: 1500 });
      }
    } else if (activeTab === 'map' && leafletRef.current) {
      leafletRef.current.flyTo([lat, lng], zoom ?? 8, { duration: 1.5 });
    }

    clearFlyTo();
  }, [flyToTarget, clearFlyTo, activeTab, renderer, cesiumRef, deckFlyTo, maplibreRef, leafletRef]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Approximate lat/lng from pixel position within the viewer area
      const rect = e.currentTarget.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      const lng = -180 + xFrac * 360;
      const lat = 90 - yFrac * 180;
      setCursorCoords({ lat, lng });
    },
    [setCursorCoords],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      const lng = -180 + xFrac * 360;
      const lat = 90 - yFrac * 180;
      showContextMenu({ x: e.clientX, y: e.clientY, lat, lng });
    },
    [showContextMenu],
  );

  const handleClick = useCallback(() => {
    hideContextMenu();
  }, [hideContextMenu]);

  // Resize viewers when switching renderer/tab or splitting (containers go
  // display:none→block, and the left pane halves its width)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'globe') {
        if (renderer === 'cesium' && cesiumRef.current && !cesiumRef.current.isDestroyed()) {
          cesiumRef.current.resize();
        } else if (renderer === 'deckgl' && deckRef.current) {
          deckRef.current.redraw('resize');
        } else if (renderer === 'maplibre' && maplibreRef.current) {
          maplibreRef.current.resize();
        }
      } else if (activeTab === 'map' && leafletRef.current) {
        leafletRef.current.invalidateSize();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab, renderer, split, cesiumRef, deckRef, maplibreRef, leafletRef]);

  return (
    <Box
      flex={1}
      style={{
        position: 'relative',
        background: '#0d1117',
        overflow: 'hidden',
      }}
      onMouseMove={handleMouseMove}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
    >
      {/* Left pane: the app's active renderer, and the whole view when unsplit */}
      <Box
        data-testid="viewer-pane-left"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: split ? '50%' : '100%',
        }}
      >
        {/* CesiumJS 3D Globe */}
        <div
          id="cesium-container"
          style={{
            position: 'absolute',
            inset: 0,
            display:
              activeTab === 'globe' && renderer === 'cesium' ? 'block' : 'none',
          }}
        />

        {/* deck.gl standalone renderer (own Deck instance) */}
        <div
          id="deckgl-container"
          style={{
            position: 'absolute',
            inset: 0,
            display:
              activeTab === 'globe' && renderer === 'deckgl' ? 'block' : 'none',
          }}
        />

        {/* MapLibre GL standalone */}
        <div
          id="maplibre-container"
          style={{
            position: 'absolute',
            inset: 0,
            display:
              activeTab === 'globe' && renderer === 'maplibre' ? 'block' : 'none',
          }}
        />

        {/* Leaflet 2D Map */}
        <div
          id="leaflet-container"
          style={{
            position: 'absolute',
            inset: 0,
            display: activeTab === 'map' ? 'block' : 'none',
          }}
        />
      </Box>

      {/* Right pane: a second renderer instance, synced to the left one */}
      {split && (
        <Box
          data-testid="viewer-pane-right"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: '50%',
            borderLeft: '2px solid #30363d',
          }}
        >
          <SplitPane renderer={paneRenderer} />
        </Box>
      )}

      {/* Overlay widgets */}
      <Minimap />
      <CoordReadout />
      <ContextMenu />
    </Box>
  );
}
