import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
// markers and controls are DOM overlays that need maplibre's stylesheet
import 'maplibre-gl/dist/maplibre-gl.css';
import { registerPmtilesProtocol } from '../features/pmtiles/source';
import { useAppStore } from '../store/app';
import { useSplitViewStore } from '../store/splitView';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import {
  applyMapLibreCamera,
  readMapLibreCamera,
  useFollowSharedCamera,
} from './cameraSync';
import { maplibreStyle } from './basemapTiles';
import { setActiveMapLibre, setPaneMapLibre } from '../viewer/registry';
import { useBuildingStore, styleDrawsBuildings } from '../store/buildings';

interface UseMapLibreOptions {
  containerId?: string;
  /**
   * 'pane' is the split view's second map: it follows the split's own renderer
   * choice, stays out of the registry every tool reads, and is removed when the
   * pane unmounts.
   */
  slot?: 'active' | 'pane';
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** Style key the live map was built from, so activation doesn't re-set it. */
  const styledKeyRef = useRef<string | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const selfHostedUrl = useAppStore((s) => s.settings.selfHostedBasemapUrl);
  const customBasemap = useAppStore((s) => s.customBasemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const splitActive = useSplitViewStore((s) => s.active);
  const paneRenderer = useSplitViewStore((s) => s.paneRenderer);

  const isPane = opts.slot === 'pane';
  const register = isPane ? setPaneMapLibre : setActiveMapLibre;
  const isActive =
    activeTab === 'globe' &&
    (isPane ? splitActive && paneRenderer === 'maplibre' : renderer === 'maplibre');
  // the custom url is part of the key: picking another catalog entry keeps
  // basemap === 'custom' and only changes the tiles
  const styleKey = `${basemap}|${selfHostedUrl}|${customBasemap?.url ?? ''}`;

  // Create/destroy map based on active state
  useEffect(() => {
    if (!isActive) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        styledKeyRef.current = null;
        register(null);
        // the buildings tool reads the active style, so a pane never speaks for it
        if (!isPane) useBuildingStore.getState().setStyleHasBuildings(false);
      }
      return;
    }

    const container = document.getElementById(
      opts.containerId ?? 'maplibre-container',
    );
    if (!container || mapRef.current) return;

    registerPmtilesProtocol();

    const cam = getSharedCamera();

    const map = new maplibregl.Map({
      container,
      style: maplibreStyle(basemap, selfHostedUrl, customBasemap),
      center: [cam.longitude, cam.latitude],
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      maxPitch: 85,
      preserveDrawingBuffer: true,
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // MapLibre only renders on the 3D Globe tab, so project vector/raster tiles
    // onto a globe. style.load re-fires after setStyle, so a basemap swap keeps it.
    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
      // vector styles like Liberty extrude their own buildings, so the OSM
      // buildings tool has nothing to add on them
      if (!isPane) {
        useBuildingStore
          .getState()
          .setStyleHasBuildings(styleDrawsBuildings(map.getStyle().layers));
      }
    });

    // 'move' rather than 'moveend' so the other split pane tracks the drag
    map.on('move', () => setSharedCamera(readMapLibreCamera(map)));

    mapRef.current = map;
    styledKeyRef.current = styleKey;
    register(map);
  }, [
    isActive,
    opts.containerId,
    basemap,
    selfHostedUrl,
    customBasemap,
    styleKey,
    isPane,
    register,
  ]);

  // Swap the basemap style when already active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isActive) return;
    // The map is built with the current basemap, so re-setting it on activation
    // would only race whatever else is adding layers to the style.
    if (styledKeyRef.current === styleKey) return;
    styledKeyRef.current = styleKey;
    const c = map.getCenter();
    const z = map.getZoom();
    const p = map.getPitch();
    const b = map.getBearing();
    map.setStyle(maplibreStyle(basemap, selfHostedUrl, customBasemap));
    map.once('styledata', () => {
      map.jumpTo({ center: c, zoom: z, pitch: p, bearing: b });
    });
  }, [basemap, selfHostedUrl, customBasemap, styleKey, isActive]);

  // In split view both panes move together
  useFollowSharedCamera(
    splitActive,
    () => (mapRef.current ? readMapLibreCamera(mapRef.current) : null),
    (cam) => {
      if (mapRef.current) applyMapLibreCamera(mapRef.current, cam);
    },
  );

  // Release the WebGL context when the owner unmounts (a closing split pane)
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      styledKeyRef.current = null;
      register(null);
    },
    [register],
  );

  return mapRef;
}
