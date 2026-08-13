import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
// markers and controls are DOM overlays that need maplibre's stylesheet
import 'maplibre-gl/dist/maplibre-gl.css';
import { registerPmtilesProtocol } from '../features/pmtiles/source';
import { registerCachedTileProtocol } from '../offline/tileProtocol';
import { useAppStore } from '../store/app';
import { useSplitViewStore, COMPARE_PANE, type Pane } from '../store/splitView';
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
   * Set for a split pane: the map follows that pane's own renderer and basemap,
   * stays out of the registry every tool reads, and is removed when the pane
   * unmounts. Unset, the map is the viewer pane the app store drives.
   */
  pane?: Pane;
  /** Which pane this is, so the registry files the map under that index. */
  paneIndex?: number;
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** Style key the live map was built from, so activation doesn't re-set it. */
  const styledKeyRef = useRef<string | null>(null);
  const viewerBasemap = useAppStore((s) => s.basemap);
  const selfHostedUrl = useAppStore((s) => s.settings.selfHostedBasemapUrl);
  const customBasemap = useAppStore((s) => s.customBasemap);
  const localBasemap = useAppStore((s) => s.localBasemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const splitActive = useSplitViewStore((s) => s.active);

  const isPane = !!opts.pane;
  const basemap = opts.pane?.basemap ?? viewerBasemap;
  const paneIndex = opts.paneIndex ?? COMPARE_PANE;
  const register = useCallback(
    (map: maplibregl.Map | null) => {
      if (isPane) setPaneMapLibre(paneIndex, map);
      else setActiveMapLibre(map);
    },
    [isPane, paneIndex],
  );
  const isActive =
    activeTab === 'globe' &&
    (opts.pane ? splitActive && opts.pane.renderer === 'maplibre' : renderer === 'maplibre');
  // the custom url is part of the key: picking another catalog entry keeps
  // basemap === 'custom' and only changes the tiles
  const styleKey = `${basemap}|${selfHostedUrl}|${customBasemap?.url ?? ''}|${
    localBasemap ? `${localBasemap.name}:${localBasemap.status}` : ''
  }`;

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
    registerCachedTileProtocol();

    const cam = getSharedCamera();

    const map = new maplibregl.Map({
      container,
      style: maplibreStyle(basemap, selfHostedUrl, customBasemap, localBasemap),
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
    localBasemap,
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
    map.setStyle(maplibreStyle(basemap, selfHostedUrl, customBasemap, localBasemap));
    map.once('styledata', () => {
      map.jumpTo({ center: c, zoom: z, pitch: p, bearing: b });
    });
  }, [basemap, selfHostedUrl, customBasemap, localBasemap, styleKey, isActive]);

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
