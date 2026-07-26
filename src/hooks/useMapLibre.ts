import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
// markers and controls are DOM overlays that need maplibre's stylesheet
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { maplibreStyle } from './basemapTiles';
import { setActiveMapLibre } from '../viewer/registry';
import { useBuildingStore, styleDrawsBuildings } from '../store/buildings';

interface UseMapLibreOptions {
  containerId?: string;
}

let pmtilesRegistered = false;

/**
 * Teach MapLibre the pmtiles:// scheme so a basemap can come from a static
 * .pmtiles archive. addProtocol is global, so register it once per page.
 */
function registerPmtilesProtocol() {
  if (pmtilesRegistered) return;
  pmtilesRegistered = true;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** Style key the live map was built from, so activation doesn't re-set it. */
  const styledKeyRef = useRef<string | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const selfHostedUrl = useAppStore((s) => s.settings.selfHostedBasemapUrl);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  const isActive = activeTab === 'globe' && renderer === 'maplibre';
  const styleKey = `${basemap}|${selfHostedUrl}`;

  // Create/destroy map based on active state
  useEffect(() => {
    if (!isActive) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        styledKeyRef.current = null;
        setActiveMapLibre(null);
        useBuildingStore.getState().setStyleHasBuildings(false);
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
      style: maplibreStyle(basemap, selfHostedUrl),
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
      useBuildingStore
        .getState()
        .setStyleHasBuildings(styleDrawsBuildings(map.getStyle().layers));
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      setSharedCamera({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    });

    mapRef.current = map;
    styledKeyRef.current = styleKey;
    setActiveMapLibre(map);
  }, [isActive, opts.containerId, basemap, selfHostedUrl, styleKey]);

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
    map.setStyle(maplibreStyle(basemap, selfHostedUrl));
    map.once('styledata', () => {
      map.jumpTo({ center: c, zoom: z, pitch: p, bearing: b });
    });
  }, [basemap, selfHostedUrl, styleKey, isActive]);

  return mapRef;
}
