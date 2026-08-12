import { create } from 'zustand';
import { useAppStore } from './app';
import { getAuthToken } from '../features/auth/store';
import { BEARER_SUBPROTOCOL } from '../lib/apiAuth';
import { jwtClaims } from '../lib/jwt';

/**
 * Chat client for tiletopia's /api/v1/realtime/{room} socket. Cursors and
 * camera-follow are not here: those belong to a live document's agora presence.
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

// tiletopia's ROOM_LIMIT_CLOSE_CODE: the account already holds its 32 concurrent
// rooms and this one would be a new room (joining someone else's never counts).
// A retry gets the same refusal, so we stay closed and say which limit it was.
const ROOM_LIMIT_CLOSE_CODE = 4029;
const ROOM_LIMIT_ERROR = 'Too many collaboration rooms open. Leave one first.';
const UNREACHABLE_ERROR = 'Could not reach the realtime service.';

/**
 * The room socket for a `tiletopiaUrl` setting that is either root-relative
 * (same-origin through the proxy) or absolute, where the scheme carries over as
 * http -> ws and https -> wss.
 */
function realtimeUrl(base: string, roomId: string): string {
  const path = `/realtime/${encodeURIComponent(roomId)}`;
  if (/^https?:\/\//i.test(base)) return `${base.replace(/^http/i, 'ws')}${path}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = base.startsWith('/') ? location.host : '';
  return `${proto}//${host}${base}${path}`;
}

/** What a closed socket means for the panel: null when we simply left the room. */
function closeError(code: number | undefined, opened: boolean): string | null {
  if (code === ROOM_LIMIT_CLOSE_CODE) return ROOM_LIMIT_ERROR;
  return opened ? null : UNREACHABLE_ERROR;
}

/** Colour for our own row when the roster arrives without us. */
const SELF_COLOR = '#a78bfa';

export interface CollabUser {
  userId: string;
  userName: string;
  color: string;
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
  /** Why the last join attempt produced no room, for the panel to show. */
  error: string | null;

  connect: (roomId: string) => void;
  disconnect: () => void;
  setUserName: (name: string) => void;
  sendChat: (message: string) => void;
}

let ws: WebSocket | null = null;

function send(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** `sub` out of a JWT, which is the id the server will stamp on our frames. */
function jwtSubject(token: string): string | null {
  const sub = jwtClaims(token)?.sub;
  return typeof sub === 'string' && sub ? sub : null;
}

export const useCollabStore = create<CollabState>()((set, get) => ({
  connected: false,
  roomId: null,
  userId: null,
  userName: 'Anonymous',
  users: [],
  messages: [],
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
    const url = realtimeUrl(tiletopiaUrl.replace(/\/$/, ''), roomId);

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
    });

    socket.addEventListener('message', (evt) => {
      try {
        handleMessage(JSON.parse(evt.data));
      } catch {
        /* ignore malformed messages */
      }
    });

    socket.addEventListener('close', (event) => {
      // a socket we already replaced or left must not touch the current state
      if (ws !== socket) return;
      ws = null;
      set({
        connected: false,
        roomId: null,
        users: [],
        userId: null,
        error: closeError(event.code, opened),
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
    set({
      connected: false,
      roomId: null,
      users: [],
      userId: null,
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
}));

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
