import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useCollabStore } from '../../src/store/collaboration';
import { CollaborationPanel } from '../../src/components/tools/CollaborationPanel';
import { useAuthStore } from '../../src/features/auth/store';
import { useAppStore } from '../../src/store/app';

/**
 * The chat client against tiletopia's realtime contract: the bearer subprotocol
 * handshake, the server-stamped sender id, and presence that is per user rather
 * than per tab. The server is a fixture here, so every frame below is a shape
 * crates/tiletopia-server/src/realtime.rs defines.
 */

/** Enough of a JWT for the client to read `sub` out of; the signature is never checked here. */
function jwt(sub: string): string {
  const seg = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${seg({ alg: 'HS256', typ: 'JWT' })}.${seg({ sub, role: 'editor' })}.signature`;
}

const SUB = 'auth0|alice';
const TOKEN = jwt(SUB);
const PEER = { user_id: 'auth0|bob', user_name: 'Bob', color: '#22d3ee' };

/** Stand-in for the room socket: records what the client sent, pushes back frames. */
class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;
  closed = false;
  sent: string[] = [];
  private listeners: Record<string, Array<(e: unknown) => void>> = {};

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(fn);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
    this.emit('close', { code });
  }

  private emit(type: string, evt: unknown) {
    for (const fn of this.listeners[type] ?? []) fn(evt);
  }

  /** The 101 landed. */
  open() {
    this.emit('open', {});
  }

  /** A frame the room fanned out. */
  receive(msg: unknown) {
    this.emit('message', { data: JSON.stringify(msg) });
  }

  frames(type?: string) {
    const all = this.sent.map((s) => JSON.parse(s));
    return type ? all.filter((m) => m.type === type) : all;
  }
}

const realWebSocket = globalThis.WebSocket;

/** Connect and complete the handshake, returning the room side of the socket. */
function joinRoom(room = 'room-1'): FakeSocket {
  useCollabStore.getState().connect(room);
  const socket = FakeSocket.instances.at(-1)!;
  socket.open();
  return socket;
}

function signIn() {
  useAuthStore.setState({ loggedIn: true, token: TOKEN, user: { name: 'Alice' } });
}

beforeEach(() => {
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  FakeSocket.instances = [];
  useCollabStore.setState({
    connected: false,
    roomId: null,
    userId: null,
    userName: 'Alice',
    users: [],
    messages: [],
    error: null,
  });
  useAuthStore.setState({ loggedIn: false, token: null, user: null });
});

afterEach(() => {
  useCollabStore.getState().disconnect();
  globalThis.WebSocket = realWebSocket;
  cleanup();
});

describe('collaboration handshake', () => {
  it('offers the bearer marker first and the raw JWT second', () => {
    signIn();
    const socket = joinRoom('room-1');
    expect(socket.url).toBe(`ws://${location.host}/api/v1/realtime/room-1`);
    expect(socket.protocols).toEqual(['bearer', TOKEN]);
  });

  it('opens no socket when signed out, since the handshake would 401', () => {
    useCollabStore.getState().connect('room-1');
    expect(FakeSocket.instances).toHaveLength(0);
    expect(useCollabStore.getState().connected).toBe(false);
    expect(useCollabStore.getState().userId).toBeNull();
    expect(useCollabStore.getState().error).toMatch(/sign in/i);
  });

  it('opens no socket for a session token that carries no subject', () => {
    // the api-key login path stores an opaque key, which the realtime route rejects
    useAuthStore.setState({ loggedIn: true, token: 'opaque-api-key', user: null });
    useCollabStore.getState().connect('room-1');
    expect(FakeSocket.instances).toHaveLength(0);
    expect(useCollabStore.getState().userId).toBeNull();
    expect(useCollabStore.getState().error).toMatch(/sign in again/i);
  });

  it('reports a rejected handshake instead of showing a room', () => {
    signIn();
    useCollabStore.getState().connect('room-1');
    // no open event: this is the 401-before-upgrade path
    FakeSocket.instances.at(-1)!.close();
    const state = useCollabStore.getState();
    expect(state.connected).toBe(false);
    expect(state.roomId).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.error).toMatch(/realtime service/i);
  });
});

describe('socket url from the tiletopiaUrl setting', () => {
  const setTiletopiaUrl = (tiletopiaUrl: string) =>
    useAppStore.setState((s) => ({ settings: { ...s.settings, tiletopiaUrl } }));

  afterEach(() => setTiletopiaUrl('/api/v1'));

  it('keeps a root-relative value on this origin', () => {
    setTiletopiaUrl('/api/v1');
    signIn();
    expect(joinRoom('room-1').url).toBe(`ws://${location.host}/api/v1/realtime/room-1`);
  });

  it('maps an absolute http value to ws, not ws://http://…', () => {
    setTiletopiaUrl('http://tiles.example:3100/api/v1');
    signIn();
    expect(joinRoom('room-1').url).toBe('ws://tiles.example:3100/api/v1/realtime/room-1');
  });

  it('maps an absolute https value to wss', () => {
    setTiletopiaUrl('https://tiles.example/api/v1');
    signIn();
    expect(joinRoom('a b').url).toBe('wss://tiles.example/api/v1/realtime/a%20b');
  });
});

describe('room limit refusal', () => {
  /** tiletopia's ROOM_LIMIT_CLOSE_CODE, sent when a 33rd room creation is refused. */
  const ROOM_LIMIT = 4029;

  it('names the limit and does not reconnect into the same refusal', () => {
    signIn();
    const socket = joinRoom('room-33');
    socket.close(ROOM_LIMIT);

    const state = useCollabStore.getState();
    expect(state.error).toMatch(/too many collaboration rooms/i);
    expect(state.connected).toBe(false);
    expect(state.roomId).toBeNull();
    // a retry would be refused the same way, so no second socket goes out
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('names the limit even when the refusal lands before the open event', () => {
    signIn();
    useCollabStore.getState().connect('room-33');
    FakeSocket.instances.at(-1)!.close(ROOM_LIMIT);
    expect(useCollabStore.getState().error).toMatch(/too many collaboration rooms/i);
  });

  it('leaves no error when a joined room closes normally', () => {
    signIn();
    joinRoom('room-1').close();
    expect(useCollabStore.getState().error).toBeNull();
  });
});

describe('server-stamped identity', () => {
  it('takes the sender id from the session JWT subject, not a local random', () => {
    signIn();
    const socket = joinRoom();
    expect(useCollabStore.getState().userId).toBe(SUB);
    expect(socket.frames('Join')).toEqual([
      { type: 'Join', user_id: SUB, asset_id: 'room-1', user_name: 'Alice' },
    ]);
  });

  it('stamps chat frames with the same id', () => {
    signIn();
    const socket = joinRoom();
    useCollabStore.getState().sendChat('hello');
    const chat = socket.frames('Chat')[0];
    expect(chat.user_id).toBe(SUB);
    expect(chat.message).toBe('hello');
    expect(Date.parse(chat.timestamp)).toBeGreaterThan(0);
  });

  it('does not treat a peer that copied our display name as us', () => {
    signIn();
    const socket = joinRoom();
    socket.receive({
      type: 'Presence',
      users: [
        { user_id: SUB, user_name: 'Alice', color: '#a78bfa' },
        { user_id: 'auth0|impostor', user_name: 'Alice', color: '#e06c75' },
      ],
    });
    const { userId, users } = useCollabStore.getState();
    expect(userId).toBe(SUB);
    expect(users.filter((u) => u.userId === userId)).toHaveLength(1);
    expect(users.map((u) => u.userId)).toEqual([SUB, 'auth0|impostor']);
  });

});

describe('presence is per user, not per tab', () => {
  it('keeps us listed when another tab of this account drops the shared entry', () => {
    signIn();
    const socket = joinRoom();
    socket.receive({
      type: 'Presence',
      users: [{ user_id: SUB, user_name: 'Alice', color: '#a78bfa' }, PEER],
    });
    expect(useCollabStore.getState().users).toHaveLength(2);

    // the other tab closed, so the server removed the account's single entry
    socket.receive({ type: 'Presence', users: [PEER] });

    const state = useCollabStore.getState();
    expect(state.connected).toBe(true);
    expect(state.roomId).toBe('room-1');
    expect(state.users.filter((u) => u.userId === SUB)).toHaveLength(1);
    // no re-join and no reconnect: that would only fight the other tab
    expect(socket.frames('Join')).toHaveLength(1);
    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('lists us once when the roster does include us', () => {
    signIn();
    const socket = joinRoom();
    socket.receive({
      type: 'Presence',
      users: [{ user_id: SUB, user_name: 'Alice', color: '#a78bfa' }],
    });
    expect(useCollabStore.getState().users).toEqual([
      { userId: SUB, userName: 'Alice', color: '#a78bfa' },
    ]);
  });

  it('leaves with the stamped id and ignores the old socket closing afterwards', () => {
    signIn();
    const first = joinRoom('room-1');
    useCollabStore.getState().disconnect();
    expect(first.frames('Leave')).toEqual([{ type: 'Leave', user_id: SUB, asset_id: 'room-1' }]);
    expect(first.closed).toBe(true);

    const second = joinRoom('room-2');
    // a late close event from the socket we already left must not tear this one down
    first.close();
    const state = useCollabStore.getState();
    expect(state.connected).toBe(true);
    expect(state.roomId).toBe('room-2');
    expect(second.closed).toBe(false);
  });
});

describe('chat history', () => {
  it('appends what the room fanned out, keeping the sender fields', () => {
    signIn();
    const socket = joinRoom();
    socket.receive({
      type: 'Chat',
      user_id: PEER.user_id,
      user_name: PEER.user_name,
      message: 'hi',
      timestamp: '2026-07-26T00:00:00.000Z',
    });
    expect(useCollabStore.getState().messages).toEqual([
      {
        userId: PEER.user_id,
        userName: PEER.user_name,
        message: 'hi',
        timestamp: '2026-07-26T00:00:00.000Z',
      },
    ]);
  });
});

// MantineProvider reads the color scheme through matchMedia, which jsdom lacks,
// and the chat log scrolls itself to the bottom on mount
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const renderPanel = () =>
  render(
    <MantineProvider>
      <CollaborationPanel onClose={() => {}} />
    </MantineProvider>,
  );

describe('CollaborationPanel', () => {
  it('asks for sign-in instead of offering a doomed join', () => {
    renderPanel();
    expect(screen.getByTestId('collab-signin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Room' })).not.toBeInTheDocument();
  });

  it('offers the join form once signed in, and shows a failed join', () => {
    signIn();
    useCollabStore.setState({ error: 'Could not reach the realtime service.' });
    renderPanel();
    expect(screen.queryByTestId('collab-signin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeInTheDocument();
    expect(screen.getByTestId('collab-error')).toHaveTextContent(/realtime service/);
  });

  it('renders a peer-chosen display name as text, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)">';
    signIn();
    useCollabStore.setState({
      connected: true,
      roomId: 'room-1',
      userId: SUB,
      users: [
        { userId: SUB, userName: 'Alice', color: '#a78bfa' },
        { userId: PEER.user_id, userName: hostile, color: PEER.color },
      ],
      messages: [
        { userId: PEER.user_id, userName: hostile, message: hostile, timestamp: '2026-07-26' },
      ],
    });
    const { container } = renderPanel();

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
    // the "(you)" badge follows the server-assigned id, not the display name
    expect(screen.getByText('Alice (you)')).toBeInTheDocument();
  });
});
