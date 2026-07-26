import { create } from 'zustand';
import { useAppStore } from './app';
import { getAuthToken } from '../features/auth/store';
import { getSharedCamera, setSharedCamera } from '../hooks/sharedCamera';

/**
 * Collaboration client for tiletopia's /api/v1/realtime/{room} socket.
 *
 * Handshake: a browser cannot set Authorization on a WebSocket, so the session
 * JWT rides in the subprotocol, marker first:
 * `new WebSocket(url, ['bearer', jwt])`. The 101 echoes only `bearer`, never the
 * token. No credential is a 401 before the upgrade, so a signed-out user gets no
 * socket at all and the panel asks them to sign in instead.
 *
 * Identity: the server rewrites `user_id` on every frame it relays to the JWT
 * `sub`, so that subject is the only id worth keying on, and `userId` below is
 * it. `user_name` stays client-chosen, so it is display text only: never
 * identity, never authorization.
 *
 * Presence is per user, not per socket: two tabs of one account are one entry
 * and either tab closing drops it. A presence list without us in it is normal
 * and says nothing about this socket, so we neither re-join nor reconnect on it.
 */

/** Marker the server looks for as the first offered subprotocol. */
const BEARER_SUBPROTOCOL = 'bearer';

/** Colour for our own row when the roster arrives without us. */
const SELF_COLOR = '#a78bfa';

export interface CollabUser {
  userId: string;
  userName: string;
  color: string;
  lat?: number;
  lng?: number;
}

interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

interface CollabState {
  connected: boolean;
  roomId: string | null;
  /** JWT subject: the id the server stamps on our frames. Null while unconnected. */
  userId: string | null;
  userName: string;
  users: CollabUser[];
  messages: ChatMessage[];
  followUserId: string | null;
  /** Why the last join attempt produced no room, for the panel to show. */
  error: string | null;

  connect: (roomId: string) => void;
  disconnect: () => void;
  setUserName: (name: string) => void;
  sendChat: (message: string) => void;
  setFollow: (userId: string | null) => void;
}

let ws: WebSocket | null = null;
let cameraInterval: ReturnType<typeof setInterval> | null = null;
let lastCameraSent = '';

function send(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** `sub` out of a JWT, which is the id the server will stamp on our frames. */
function jwtSubject(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

export const useCollabStore = create<CollabState>()((set, get) => ({
  connected: false,
  roomId: null,
  userId: null,
  userName: 'Anonymous',
  users: [],
  messages: [],
  followUserId: null,
  error: null,

  setUserName: (userName) => set({ userName }),

  connect: (roomId) => {
    if (ws) get().disconnect();

    const token = getAuthToken();
    if (!token) {
      set({ error: 'Sign in to join a room.' });
      return;
    }

    const { tiletopiaUrl } = useAppStore.getState().settings;
    const base = tiletopiaUrl.replace(/\/$/, '');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = base.startsWith('/') ? location.host : '';
    const path = `${host}${base}/realtime/${encodeURIComponent(roomId)}`;
    const url = `${proto}//${path}`;

    // the server keys presence and every relayed frame on the token subject, so a
    // token without one leaves us unable to tell our own frames from a peer's.
    // the realtime route rejects such a token anyway: it is not a session JWT.
    const userId = jwtSubject(token);
    if (!userId) {
      set({ error: 'This session cannot join a room. Sign in again.' });
      return;
    }

    const socket = new WebSocket(url, [BEARER_SUBPROTOCOL, token]);
    ws = socket;
    set({ error: null, userId });

    /** A close before this flips is a rejected handshake, not a room we left. */
    let opened = false;

    socket.addEventListener('open', () => {
      opened = true;
      set({ connected: true, roomId });
      send({
        type: 'Join',
        user_id: userId,
        asset_id: roomId,
        user_name: get().userName,
      });
      startCameraBroadcast();
    });

    socket.addEventListener('message', (evt) => {
      try {
        handleMessage(JSON.parse(evt.data));
      } catch {
        /* ignore malformed messages */
      }
    });

    socket.addEventListener('close', () => {
      // a socket we already replaced or left must not touch the current state
      if (ws !== socket) return;
      ws = null;
      stopCameraBroadcast();
      set({
        connected: false,
        roomId: null,
        users: [],
        userId: null,
        error: opened ? null : 'Could not reach the realtime service.',
      });
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  },

  disconnect: () => {
    const { roomId, userId } = get();
    if (ws) {
      if (roomId) send({ type: 'Leave', user_id: userId ?? '', asset_id: roomId });
      const socket = ws;
      ws = null;
      socket.close();
    }
    stopCameraBroadcast();
    set({
      connected: false,
      roomId: null,
      users: [],
      userId: null,
      followUserId: null,
      error: null,
    });
  },

  sendChat: (message) => {
    const { userId, userName } = get();
    send({
      type: 'Chat',
      user_id: userId ?? '',
      user_name: userName,
      message,
      timestamp: new Date().toISOString(),
    });
  },

  setFollow: (followUserId) => set({ followUserId }),
}));

/**
 * ViewChanged carries a camera height in metres while our renderers work in
 * web-mercator zoom, so convert on the wire. Metres across a nominal 512px
 * viewport at that latitude: monotonic and exact on a round trip between two
 * viewtopia clients, close enough for a Cesium-native one.
 */
const EARTH_CIRCUMFERENCE_M = 40075016.686;

/** Latitude in radians, off the poles so cos() never reaches 0. */
function clampedLatRad(latitude: number): number {
  return (Math.min(Math.max(latitude, -85), 85) * Math.PI) / 180;
}

function zoomToHeight(zoom: number, latitude: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos(clampedLatRad(latitude))) / Math.pow(2, zoom + 1);
}

function heightToZoom(height: number, latitude: number): number {
  if (!(height > 0)) return 0;
  const zoom = Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos(clampedLatRad(latitude))) / height) - 1;
  return Math.min(Math.max(zoom, 0), 24);
}

function startCameraBroadcast() {
  stopCameraBroadcast();
  cameraInterval = setInterval(() => {
    const cam = getSharedCamera();
    const key = `${cam.latitude.toFixed(6)},${cam.longitude.toFixed(6)},${cam.zoom.toFixed(2)},${cam.bearing.toFixed(1)},${cam.pitch.toFixed(1)}`;
    if (key === lastCameraSent) return;
    lastCameraSent = key;
    const { userId } = useCollabStore.getState();
    send({
      type: 'ViewChanged',
      user_id: userId ?? '',
      camera: {
        longitude: cam.longitude,
        latitude: cam.latitude,
        height: zoomToHeight(cam.zoom, cam.latitude),
        heading: cam.bearing,
        pitch: cam.pitch,
        roll: 0,
      },
    });
  }, 200);
}

function stopCameraBroadcast() {
  if (cameraInterval) {
    clearInterval(cameraInterval);
    cameraInterval = null;
  }
  lastCameraSent = '';
}

function handleMessage(msg: Record<string, unknown>) {
  const store = useCollabStore.getState();

  switch (msg.type) {
    case 'Presence': {
      if (!Array.isArray(msg.users)) break;
      const users: CollabUser[] = (msg.users as Array<Record<string, string>>).map((u) => ({
        userId: u.user_id ?? '',
        userName: u.user_name ?? 'Unknown',
        color: u.color ?? SELF_COLOR,
      }));
      // presence is keyed per user, so another tab of this account closing takes
      // our entry with it. keep showing ourselves rather than re-joining, which
      // would only fight that tab.
      const self = store.userId;
      if (self && !users.some((u) => u.userId === self)) {
        users.push({ userId: self, userName: store.userName, color: SELF_COLOR });
      }
      useCollabStore.setState({ users });
      break;
    }

    case 'Cursor':
      if (msg.user_id !== store.userId) {
        useCollabStore.setState((s) => ({
          users: s.users.map((u) =>
            u.userId === msg.user_id
              ? { ...u, lat: msg.latitude as number, lng: msg.longitude as number }
              : u,
          ),
        }));
      }
      break;

    case 'ViewChanged': {
      const cam = msg.camera as Record<string, number> | undefined;
      if (!cam) break;
      if (msg.user_id === store.userId || msg.user_id !== store.followUserId) break;
      setSharedCamera({
        latitude: cam.latitude,
        longitude: cam.longitude,
        zoom: heightToZoom(cam.height, cam.latitude),
        bearing: cam.heading,
        pitch: cam.pitch,
      });
      break;
    }

    case 'Chat':
      useCollabStore.setState((s) => ({
        messages: [
          ...s.messages,
          {
            userId: (msg.user_id ?? '') as string,
            userName: (msg.user_name ?? 'Unknown') as string,
            message: (msg.message ?? '') as string,
            timestamp: (msg.timestamp ?? new Date().toISOString()) as string,
          },
        ],
      }));
      break;
  }
}
