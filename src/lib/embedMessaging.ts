import { useEffect } from 'react';
import { useAppStore } from '../store/app';
import { setLayerVisible } from '../store/layerControls';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getSharedCamera, subscribeSharedCamera } from '../hooks/sharedCamera';
import { clickCoordinates } from './mapClickCoordinates';

/**
 * The postMessage surface an `?embed=1` iframe offers its host page, so a
 * dashboard can drive the embed without touching its URL.
 *
 * Host → embed: `viewtopia:flyTo` {lng, lat, zoom?}, `viewtopia:getCamera`
 * {requestId?}, `viewtopia:listLayers` {requestId?},
 * `viewtopia:setLayerVisibility` {layerId, visible}.
 * Embed → host: `viewtopia:ready` once on boot, `viewtopia:camera` (as a
 * reply, and throttled on every move), `viewtopia:layers` (reply),
 * `viewtopia:click` {lng, lat}.
 *
 * Only messages from the parent window are honoured, and everything the
 * embed sends is state the host's own URL already grants it a view of.
 */

const CAMERA_EVENT_THROTTLE_MS = 200;

function postToHost(message: Record<string, unknown>): void {
  window.parent.postMessage(message, '*');
}

function layerSummaries() {
  return useAppStore
    .getState()
    .layers.map(({ id, name, type, visible }) => ({ id, name, type, visible }));
}

function showLayer(layerId: string, visible: boolean): void {
  if (!useAppStore.getState().layers.some((layer) => layer.id === layerId)) return;
  setLayerVisible(layerId, visible);
}

function handleHostMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  const data = event.data as Record<string, unknown> | null;
  if (typeof data?.type !== 'string') return;
  const requestId = data.requestId;

  switch (data.type) {
    case 'viewtopia:flyTo': {
      const { lng, lat, zoom } = data;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;
      useSpaceTimeStore.getState().flyTo(lng, lat, typeof zoom === 'number' ? zoom : undefined);
      return;
    }
    case 'viewtopia:getCamera':
      postToHost({ type: 'viewtopia:camera', camera: getSharedCamera(), requestId });
      return;
    case 'viewtopia:listLayers':
      postToHost({ type: 'viewtopia:layers', layers: layerSummaries(), requestId });
      return;
    case 'viewtopia:setLayerVisibility':
      if (typeof data.layerId === 'string') showLayer(data.layerId, data.visible === true);
      return;
  }
}

/** Active only in an embed that actually sits in an iframe. */
export function useEmbedMessaging(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || window.parent === window) return;

    const onClick = (event: MouseEvent) => {
      const coordinates = clickCoordinates(event);
      if (coordinates) postToHost({ type: 'viewtopia:click', ...coordinates });
    };

    let cameraTimer: number | null = null;
    const unsubscribeCamera = subscribeSharedCamera(() => {
      if (cameraTimer !== null) return;
      cameraTimer = window.setTimeout(() => {
        cameraTimer = null;
        postToHost({ type: 'viewtopia:camera', camera: getSharedCamera() });
      }, CAMERA_EVENT_THROTTLE_MS);
    });

    window.addEventListener('message', handleHostMessage);
    window.addEventListener('click', onClick);
    postToHost({ type: 'viewtopia:ready' });

    return () => {
      window.removeEventListener('message', handleHostMessage);
      window.removeEventListener('click', onClick);
      unsubscribeCamera();
      if (cameraTimer !== null) window.clearTimeout(cameraTimer);
    };
  }, [enabled]);
}
