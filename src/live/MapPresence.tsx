import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { getActiveMapLibre } from '../viewer/registry';
import { useLiveStore } from './liveStore';
import type { LiveViewport } from './types';

const PEER_COLORS = ['#a78bfa', '#f87171', '#34d399', '#60a5fa', '#fbbf24', '#f472b6'];

/** Same peer, same colour, without the server having to assign one. */
export function peerColor(actor: string): string {
  let hash = 0;
  for (const character of actor) hash = (hash * 31 + character.charCodeAt(0)) % 99991;
  return PEER_COLORS[hash % PEER_COLORS.length];
}

export function cursorElement(name: string, color: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.testid = 'peer-cursor';
  wrapper.dataset.peerName = name;
  wrapper.style.cssText = 'display:flex;align-items:flex-start;gap:2px;pointer-events:none';

  const arrow = document.createElement('div');
  arrow.style.cssText = `width:0;height:0;border-left:7px solid ${color};border-bottom:11px solid transparent;border-right:5px solid transparent`;

  const label = document.createElement('span');
  label.textContent = name;
  label.style.cssText = `background:${color};color:#0d1117;font:600 10px sans-serif;padding:1px 4px;border-radius:3px;white-space:nowrap`;

  wrapper.append(arrow, label);
  return wrapper;
}

interface PresenceMap {
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  on: (event: string, handler: (event: { lngLat: { lng: number; lat: number } }) => void) => void;
  off: (event: string, handler: (event: { lngLat: { lng: number; lat: number } }) => void) => void;
}

/** Feeds this client's pointer and viewport into the session, throttled by the store. */
export function attachPresenceBroadcast(map: PresenceMap): () => void {
  const viewport = () => {
    const center = map.getCenter();
    return { center: [center.lng, center.lat] as [number, number], zoom: map.getZoom() };
  };
  const onMouseMove = (event: { lngLat: { lng: number; lat: number } }) => {
    useLiveStore.getState().sendPresence({
      cursor: [event.lngLat.lng, event.lngLat.lat],
      selection: [],
      viewport: viewport(),
    });
  };
  const onMouseOut = () => {
    useLiveStore.getState().sendPresence({ cursor: null, selection: [], viewport: viewport() });
  };
  map.on('mousemove', onMouseMove);
  map.on('mouseout', onMouseOut);
  return () => {
    map.off('mousemove', onMouseMove);
    map.off('mouseout', onMouseOut);
  };
}

interface CameraEvent {
  originalEvent?: unknown;
}

interface FollowMap {
  jumpTo: (options: { center: [number, number]; zoom: number }) => void;
  on: (event: string, handler: (event: CameraEvent) => void) => void;
  off: (event: string, handler: (event: CameraEvent) => void) => void;
}

/**
 * Puts the local camera on one peer's presence viewport until a local gesture
 * takes it back. Only a gesture carries `originalEvent`, which is what keeps the
 * jumpTo below from reading as the user grabbing the map.
 */
export function attachCameraFollow(map: FollowMap, actor: string): () => void {
  const stopOnLocalGesture = (event: CameraEvent) => {
    if (event.originalEvent) useLiveStore.getState().setFollowedActor(null);
  };
  map.on('movestart', stopOnLocalGesture);

  let applied: LiveViewport | null = null;
  const follow = () => {
    const viewport = useLiveStore.getState().presence[actor]?.viewport ?? null;
    if (!viewport || viewport === applied) return;
    applied = viewport;
    map.jumpTo({ center: viewport.center, zoom: viewport.zoom });
  };
  follow();
  const unsubscribe = useLiveStore.subscribe(follow);

  return () => {
    map.off('movestart', stopOnLocalGesture);
    unsubscribe();
  };
}

/**
 * Peer cursors on the MapLibre map. The other renderers get nothing: Cesium and
 * Leaflet would each need their own overlay, the way Timelapse gates on MapLibre.
 */
export function MapPresence() {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const documentId = useLiveStore((s) => s.documentId);
  const peers = useLiveStore((s) => s.peers);
  const presence = useLiveStore((s) => s.presence);
  const followedActor = useLiveStore((s) => s.followedActor);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const onMapLibre = renderer === 'maplibre' && activeTab === 'globe' && documentId !== null;

  useEffect(() => {
    if (!onMapLibre) return;
    const map = getActiveMapLibre();
    if (!map) return;
    return attachPresenceBroadcast(map);
  }, [onMapLibre]);

  useEffect(() => {
    if (!onMapLibre || followedActor === null) return;
    const map = getActiveMapLibre();
    if (!map) return;
    return attachCameraFollow(map, followedActor);
  }, [onMapLibre, followedActor]);

  useEffect(() => {
    const markers = markersRef.current;
    const map = onMapLibre ? getActiveMapLibre() : null;
    if (!map) {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      return;
    }
    const names = new Map(peers.map((peer) => [peer.actor, peer.name]));
    for (const [actor, marker] of markers) {
      if (presence[actor]?.cursor) continue;
      marker.remove();
      markers.delete(actor);
    }
    for (const [actor, entry] of Object.entries(presence)) {
      if (!entry.cursor) continue;
      const known = markers.get(actor);
      if (known) {
        known.setLngLat(entry.cursor);
        continue;
      }
      markers.set(
        actor,
        new maplibregl.Marker({
          element: cursorElement(names.get(actor) ?? actor, peerColor(actor)),
          anchor: 'top-left',
        })
          .setLngLat(entry.cursor)
          .addTo(map),
      );
    }
  }, [onMapLibre, peers, presence]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, []);

  return null;
}
