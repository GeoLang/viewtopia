import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppStore } from '../store/app';
import { useSplitViewStore, type Pane } from '../store/splitView';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { useFollowSharedCamera } from './cameraSync';
import { rasterTiles } from './basemapTiles';
import { CachedTileLayer } from '../offline/cachedTileLayer';

declare global {
  interface Window {
    /** leaflet split panes by pane index, for e2e; no tool reads these */
    __viewtopiaPaneLeaflets?: Record<number, L.Map>;
  }
}

const paneMaps = new Map<number, L.Map>();

function publishPaneMap(index: number, map: L.Map | null): void {
  if (map) paneMaps.set(index, map);
  else paneMaps.delete(index);
  window.__viewtopiaPaneLeaflets = Object.fromEntries(paneMaps);
}

interface UseLeafletOptions {
  containerId?: string;
  /**
   * Set for a split pane: the map follows that pane's own basemap, draws while
   * the split is on rather than on the 2D tab, and is removed when the pane
   * unmounts. Unset, it is the 2D Map tab's viewer.
   */
  pane?: Pane;
  /** Which pane this is, so e2e can find the map. */
  paneIndex?: number;
}

export function useLeaflet(opts: UseLeafletOptions = {}) {
  const mapRef = useRef<L.Map | null>(null);
  // building the map only writes a ref, which nothing downstream can react to,
  // so this renders the caller again with the new instance in the ref
  const [, setLiveMap] = useState<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const viewerBasemap = useAppStore((s) => s.basemap);
  const customBasemap = useAppStore((s) => s.customBasemap);
  const activeTab = useAppStore((s) => s.activeTab);
  const splitActive = useSplitViewStore((s) => s.active);

  const isPane = !!opts.pane;
  const paneIndex = opts.paneIndex ?? 0;
  const basemap = opts.pane?.basemap ?? viewerBasemap;
  const isActive = opts.pane
    ? splitActive && activeTab === 'globe' && opts.pane.renderer === 'leaflet'
    : activeTab === 'map';

  useEffect(() => {
    if (!isActive) return;
    const container = document.getElementById(
      opts.containerId ?? 'leaflet-container',
    );
    if (!container || mapRef.current) return;

    const cam = getSharedCamera();

    const map = L.map(container, {
      center: [cam.latitude, cam.longitude],
      zoom: cam.zoom,
      zoomControl: true,
      // a pane shares the camera with the 3D ones, so it has to hold the
      // fractional zoom they publish instead of snapping and dragging them along
      zoomSnap: isPane ? 0 : 1,
    });

    // 'move' rather than 'moveend' so the other split panes track a drag
    map.on('move', () => {
      const c = map.getCenter();
      setSharedCamera({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
      });
    });

    mapRef.current = map;
    setLiveMap(map);
    if (isPane) publishPaneMap(paneIndex, map);

    return () => {
      map.remove();
      mapRef.current = null;
      setLiveMap(null);
      tileRef.current = null;
      if (isPane) publishPaneMap(paneIndex, null);
    };
  }, [isActive, isPane, paneIndex, opts.containerId]);

  // Tiles for the basemap, and the ones the map is built with: this runs right
  // after the effect above, which creates it bare.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove existing tile layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });
    // a local .pmtiles archive has no tile URL leaflet could fetch, so the map
    // stays empty rather than showing some other basemap
    const tile = rasterTiles(basemap, customBasemap);
    tileRef.current = tile
      ? new CachedTileLayer(tile.url, { attribution: tile.attr, maxZoom: 19 }).addTo(map)
      : null;
    // customBasemap is a dependency too: another catalog entry keeps
    // basemap === 'custom' and changes only the tiles
  }, [basemap, customBasemap, isActive]);

  // A pane moves with the others. Pitch and bearing are echoed back rather than
  // reported as zero, or every 3D move would read as a change and this map
  // would answer it with a correction of its own.
  useFollowSharedCamera(
    isPane && isActive,
    () => {
      const map = mapRef.current;
      if (!map) return null;
      const c = map.getCenter();
      const shared = getSharedCamera();
      return {
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: shared.pitch,
        bearing: shared.bearing,
      };
    },
    (cam) => {
      mapRef.current?.setView([cam.latitude, cam.longitude], cam.zoom, { animate: false });
    },
  );

  // Restore shared camera when switching TO map tab
  useEffect(() => {
    if (isPane || activeTab !== 'map') return;
    const map = mapRef.current;
    if (!map) return;
    const cam = getSharedCamera();
    map.setView([cam.latitude, cam.longitude], cam.zoom, { animate: false });
    // leaving the tab destroys the map, and invalidateSize on a destroyed one
    // throws on its missing pane
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [activeTab, isPane]);

  return mapRef;
}
