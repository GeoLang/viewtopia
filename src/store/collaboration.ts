import { create } from 'zustand';
import { useAppStore } from './app';
import { getSharedCamera, setSharedCamera, type SharedCamera } from '../hooks/sharedCamera';

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
  userId: string;
  userName: string;
  users: CollabUser[];
  messages: ChatMessage[];
  followUserId: string | null;

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

export const useCollabStore = create<CollabState>()((set, get) => ({
  connected: false,
  roomId: null,
  userId: 'user-' + Math.random().toString(36).slice(2, 8),
  userName: 'Anonymous',
  users: [],
  messages: [],
  followUserId: null,

  setUserName: (userName) => set({ userName }),

  connect: (roomId) => {
    const state = get();
    if (ws) state.disconnect();

    const { tiletopiaUrl } = useAppStore.getState().settings;
    const base = tiletopiaUrl.replace(/\/$/, '');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = base.startsWith('/') ? location.host : '';
    const path = `${host}${base}/realtime/${encodeURIComponent(roomId)}`;
    const url = `${proto}//${path}`;

    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      set({ connected: true, roomId });
      send({
        type: 'Join',
        user_id: state.userId,
        asset_id: roomId,
        user_name: state.userName,
      });
      startCameraBroadcast();
    });

    ws.addEventListener('message', (evt) => {
      try {
        handleMessage(JSON.parse(evt.data));
      } catch {
        /* ignore malformed messages */
      }
    });

    ws.addEventListener('close', () => {
      stopCameraBroadcast();
      set({ connected: false, roomId: null, users: [] });
      ws = null;
    });

    ws.addEventListener('error', () => {
      ws?.close();
    });
  },

  disconnect: () => {
    const state = get();
    if (ws) {
      if (state.roomId) {
        send({ type: 'Leave', user_id: state.userId, asset_id: state.roomId });
      }
      ws.close();
      ws = null;
    }
    stopCameraBroadcast();
    set({ connected: false, roomId: null, users: [], followUserId: null });
  },

  sendChat: (message) => {
    const state = get();
    send({
      type: 'Chat',
      user_id: state.userId,
      user_name: state.userName,
      message,
      timestamp: new Date().toISOString(),
    });
  },

  setFollow: (followUserId) => set({ followUserId }),
}));

function startCameraBroadcast() {
  stopCameraBroadcast();
  cameraInterval = setInterval(() => {
    const cam = getSharedCamera();
    if (!cam) return;
    const key = `${cam.latitude.toFixed(6)},${cam.longitude.toFixed(6)},${cam.zoom.toFixed(2)},${cam.bearing.toFixed(1)},${cam.pitch.toFixed(1)}`;
    if (key === lastCameraSent) return;
    lastCameraSent = key;
    const { userId } = useCollabStore.getState();
    send({
      type: 'Camera',
      user_id: userId,
      latitude: cam.latitude,
      longitude: cam.longitude,
      zoom: cam.zoom,
      bearing: cam.bearing,
      pitch: cam.pitch,
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
    case 'Presence':
      if (Array.isArray(msg.users)) {
        useCollabStore.setState({
          users: (msg.users as Array<Record<string, string>>).map((u) => ({
            userId: u.user_id ?? u.userId ?? '',
            userName: u.user_name ?? u.userName ?? 'Unknown',
            color: u.color ?? '#7c3aed',
          })),
        });
      }
      break;

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

    case 'Camera':
      if (msg.user_id !== store.userId && msg.user_id === store.followUserId) {
        const cam: Partial<SharedCamera> = {
          latitude: msg.latitude as number,
          longitude: msg.longitude as number,
          zoom: msg.zoom as number,
          bearing: msg.bearing as number,
          pitch: msg.pitch as number,
        };
        setSharedCamera(cam);
      }
      break;

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
