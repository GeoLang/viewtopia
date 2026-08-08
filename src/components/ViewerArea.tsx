import { useEffect, useCallback } from 'react';
import { Box } from '@mantine/core';
import { Cartesian2, Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { useAppStore } from '../store/app';
import { useSplitViewStore } from '../store/splitView';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { useCesium } from '../hooks/useCesium';
import { useMapLibre } from '../hooks/useMapLibre';
import { useDeckOverlay } from '../hooks/useDeckOverlay';
import { useLeaflet } from '../hooks/useLeaflet';
import { useSpaceTimeTracks } from '../hooks/useSpaceTimeTracks';
import { useSpaceTimeDeckLayers } from '../hooks/useSpaceTimeDeckLayers';
import { useSpaceTimeCesium } from '../hooks/useSpaceTimeCesium';
import { useBuildingsCesium } from '../hooks/useBuildingsCesium';
import { useBuildingsMapLibre } from '../hooks/useBuildingsMapLibre';
import { useHeatmapsMapLibre } from '../hooks/useHeatmapsMapLibre';
import { useAgentLayersCesium } from '../hooks/useAgentLayersCesium';
import { useAgentLayersMapLibre } from '../hooks/useAgentLayersMapLibre';
import { useAgentLayersLeaflet } from '../hooks/useAgentLayersLeaflet';
import { useOgcLayersCesium } from '../hooks/useOgcLayersCesium';
import { useOgcLayersMapLibre } from '../hooks/useOgcLayersMapLibre';
import { useDrawCesium } from '../hooks/useDrawCesium';
import { useDrawMapLibre } from '../hooks/useDrawMapLibre';
import { useAnnotationsCesium } from '../hooks/useAnnotationsCesium';
import { useAnnotationsMapLibre } from '../hooks/useAnnotationsMapLibre';
import { useMeasureCesium } from '../hooks/useMeasureCesium';
import { useFeaturePickerCesium } from '../hooks/useFeaturePickerCesium';
import { useFeaturePickerMapLibre } from '../hooks/useFeaturePickerMapLibre';
import { useMeasureMapLibre } from '../hooks/useMeasureMapLibre';
import { useShareLinkHash } from '../hooks/useShareLinkHash';
import { CesiumNavControl } from './CesiumNavControl';
import { Minimap } from './Minimap';
import { CoordReadout } from './CoordReadout';
import { setPanelDockElement } from './PanelCard';
import { ContextMenu } from './ContextMenu';
import { BasemapRendererControl } from './BasemapRendererControl';
import { SplitPane } from './SplitPane';

export function ViewerArea() {
  const { activeTab, renderer } = useAppStore();
  const splitActive = useSplitViewStore((s) => s.active);
  const paneRenderer = useSplitViewStore((s) => s.paneRenderer);
  const swipeAt = useSplitViewStore((s) => s.swipeAt);
  // the second pane is a globe renderer, so the 2D map tab stays single
  const split = splitActive && activeTab === 'globe';
  // a swipe overlays the panes instead of halving them
  const swipe = split && swipeAt !== null;
  const setCursorCoords = useAppStore((s) => s.setCursorCoords);
  const showContextMenu = useAppStore((s) => s.showContextMenu);
  const hideContextMenu = useAppStore((s) => s.hideContextMenu);
  const flyToTarget = useSpaceTimeStore((s) => s.flyToTarget);
  const clearFlyTo = useSpaceTimeStore((s) => s.clearFlyTo);

  // Initialize all viewer engines (they mount into DOM containers below)
  const cesiumRef = useCesium({ containerId: 'cesium-container' });
  const maplibreRef = useMapLibre({ containerId: 'maplibre-container' });
  const leafletRef = useLeaflet({ containerId: 'leaflet-container' });

  // deck.gl draws through the MapLibre map, so it needs the map to exist first
  useDeckOverlay(maplibreRef);

  // Render spacetime tracks on all renderers
  useSpaceTimeTracks(maplibreRef);
  useSpaceTimeDeckLayers();
  useSpaceTimeCesium(cesiumRef);

  // Render OSM buildings on all 3D renderers (maplibre draws its own
  // fill-extrusions; a deck copy would z-fight with them)
  useBuildingsCesium(cesiumRef);
  useBuildingsMapLibre(maplibreRef);

  // Heatmaps are native maplibre layers: deck's HeatmapLayer is screen-space and
  // draws nothing under the globe projection
  useHeatmapsMapLibre(maplibreRef);

  // Render the agent's ui_spec layers on whichever renderer is active
  useAgentLayersCesium(cesiumRef);
  useAgentLayersMapLibre(maplibreRef);
  useAgentLayersLeaflet(leafletRef);

  // OGC/XYZ services the user added (raster imagery; no deck.gl equivalent)
  useOgcLayersCesium(cesiumRef);
  useOgcLayersMapLibre(maplibreRef);

  // Drawing tools
  useDrawCesium(cesiumRef);
  useDrawMapLibre(maplibreRef);

  // Annotations, bound here rather than in the panel so one arriving from a
  // live peer still draws while the panel is closed
  useAnnotationsCesium(cesiumRef);
  useAnnotationsMapLibre(maplibreRef);

  // Measurement tools (Cesium + MapLibre)
  useMeasureCesium(cesiumRef);
  useMeasureMapLibre(maplibreRef);

  // Feature picker — inspect clicked features (the MapLibre binding also picks
  // the deck overlay's layers)
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

    const altitude = zoom ? 4e7 / 2 ** zoom : 5_000_000;

    if (activeTab === 'globe') {
      if (renderer === 'cesium' && cesiumRef.current && !cesiumRef.current.isDestroyed()) {
        cesiumRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(lng, lat, altitude),
          duration: 1.5,
        });
      } else if (renderer === 'maplibre' && maplibreRef.current) {
        maplibreRef.current.flyTo({ center: [lng, lat], zoom: zoom ?? 8, duration: 1500 });
      }
    } else if (activeTab === 'map' && leafletRef.current) {
      leafletRef.current.flyTo([lat, lng], zoom ?? 8, { duration: 1.5 });
    }

    clearFlyTo();
  }, [flyToTarget, clearFlyTo, activeTab, renderer, cesiumRef, maplibreRef, leafletRef]);

  // Real screen→geographic conversion on the active renderer. Null when the
  // pointer misses the globe (sky) or no renderer is up.
  const screenToLngLat = useCallback(
    (clientX: number, clientY: number): { lat: number; lng: number } | null => {
      if (activeTab === 'globe' && renderer === 'cesium') {
        const viewer = cesiumRef.current;
        if (!viewer || viewer.isDestroyed()) return null;
        const rect = viewer.canvas.getBoundingClientRect();
        const picked = viewer.camera.pickEllipsoid(
          new Cartesian2(clientX - rect.left, clientY - rect.top),
          viewer.scene.globe.ellipsoid,
        );
        if (!picked) return null;
        const carto = Cartographic.fromCartesian(picked);
        return {
          lat: CesiumMath.toDegrees(carto.latitude),
          lng: CesiumMath.toDegrees(carto.longitude),
        };
      }
      if (activeTab === 'globe' && renderer === 'maplibre') {
        const map = maplibreRef.current;
        if (!map) return null;
        const rect = map.getContainer().getBoundingClientRect();
        const p = map.unproject([clientX - rect.left, clientY - rect.top]);
        return { lat: p.lat, lng: p.lng };
      }
      if (activeTab === 'map') {
        const map = leafletRef.current;
        if (!map) return null;
        const rect = map.getContainer().getBoundingClientRect();
        const p = map.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
        return { lat: p.lat, lng: p.lng };
      }
      return null;
    },
    [activeTab, renderer, cesiumRef, maplibreRef, leafletRef],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = screenToLngLat(e.clientX, e.clientY);
      if (coords) setCursorCoords(coords);
    },
    [screenToLngLat, setCursorCoords],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const coords = screenToLngLat(e.clientX, e.clientY);
      if (coords) showContextMenu({ x: e.clientX, y: e.clientY, ...coords });
    },
    [screenToLngLat, showContextMenu],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      hideContextMenu();
      const coords = screenToLngLat(e.clientX, e.clientY);
      if (coords) {
        window.dispatchEvent(new CustomEvent('viewtopia:map:click', { detail: coords }));
      }
    },
    [hideContextMenu, screenToLngLat],
  );

  // Resize viewers when switching renderer/tab or splitting (containers go
  // display:none→block, and the left pane halves its width)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'globe') {
        if (renderer === 'cesium' && cesiumRef.current && !cesiumRef.current.isDestroyed()) {
          cesiumRef.current.resize();
        } else if (renderer === 'maplibre' && maplibreRef.current) {
          maplibreRef.current.resize();
        }
      } else if (activeTab === 'map' && leafletRef.current) {
        leafletRef.current.invalidateSize();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab, renderer, split, swipe, cesiumRef, maplibreRef, leafletRef]);

  return (
    <Box
      flex={1}
      style={{
        position: 'relative',
        background: 'var(--mantine-color-dark-8)',
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
          width: split && !swipe ? '50%' : '100%',
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
        {/* cesium has no built-in zoom/compass, so match maplibre's control */}
        {activeTab === 'globe' && renderer === 'cesium' && <CesiumNavControl />}

        {/* MapLibre GL, with the deck.gl layers interleaved into it */}
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
            // leaflet panes carry z-index 400+; without an own stacking
            // context they paint over body-level dropdowns (z 300)
            zIndex: 0,
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
            width: swipe ? '100%' : '50%',
            borderLeft: swipe ? undefined : '2px solid var(--mantine-color-dark-5)',
            clipPath: swipe ? `inset(0 0 0 ${swipeAt}%)` : undefined,
          }}
        >
          <SplitPane renderer={paneRenderer} />
        </Box>
      )}

      {/* Overlay widgets */}
      <BasemapRendererControl />
      <Minimap />
      <CoordReadout />
      <ContextMenu />

      {/* right-anchored PanelCards portal in here and stack without collisions */}
      <div className="panel-dock" ref={setPanelDockElement} />
    </Box>
  );
}
