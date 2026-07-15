import { useEffect, useCallback } from 'react';
import { Box } from '@mantine/core';
import { Cartesian3 } from 'cesium';
import { useAppStore } from '../store/app';
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
import { useDrawCesium } from '../hooks/useDrawCesium';
import { useDrawMapLibre } from '../hooks/useDrawMapLibre';
import { useMeasureCesium } from '../hooks/useMeasureCesium';
import { useFeaturePickerCesium } from '../hooks/useFeaturePickerCesium';
import { useMeasureMapLibre } from '../hooks/useMeasureMapLibre';
import { useShareLinkHash } from '../hooks/useShareLinkHash';
import { Minimap } from './Minimap';
import { CoordReadout } from './CoordReadout';
import { ContextMenu } from './ContextMenu';

export function ViewerArea() {
  const { activeTab, renderer } = useAppStore();
  const setCursorCoords = useAppStore((s) => s.setCursorCoords);
  const showContextMenu = useAppStore((s) => s.showContextMenu);
  const hideContextMenu = useAppStore((s) => s.hideContextMenu);
  const flyToTarget = useSpaceTimeStore((s) => s.flyToTarget);
  const clearFlyTo = useSpaceTimeStore((s) => s.clearFlyTo);

  // Initialize all viewer engines (they mount into DOM containers below)
  const cesiumRef = useCesium({ containerId: 'cesium-container' });
  const { deckRef, flyTo: deckFlyTo } = useDeckGL({ containerId: 'deckgl-container' });
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

  // Drawing tools (Cesium + MapLibre; deck.gl is a standalone Deck, not a map)
  useDrawCesium(cesiumRef);
  useDrawMapLibre(maplibreRef);

  // Measurement tools (Cesium + MapLibre)
  useMeasureCesium(cesiumRef);
  useMeasureMapLibre(maplibreRef);

  // Feature picker — inspect 3D Tiles features (Cesium only)
  useFeaturePickerCesium(cesiumRef);

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

  // Resize viewers when switching renderer/tab (containers go display:none→block)
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
  }, [activeTab, renderer, cesiumRef, deckRef, maplibreRef, leafletRef]);

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
      {/* CesiumJS 3D Globe */}
      <div
        id="cesium-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
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

      {/* Overlay widgets */}
      <Minimap />
      <CoordReadout />
      <ContextMenu />
    </Box>
  );
}
