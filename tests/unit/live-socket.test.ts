import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveSocket, agoraSocketUrl, type LiveConnectionState } from '../../src/live/socket';
import type { ServerMessage } from '../../src/live/types';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

let server: FakeAgoraServer;
let states: LiveConnectionState[];
let received: ServerMessage[];
let sinceForResume: number | null;
let socket: LiveSocket;

function makeSocket(): LiveSocket {
  return new LiveSocket({
    documentId: 'doc-1',
    token: 'jwt-token',
    sinceForResume: () => sinceForResume,
    onMessage: (message) => received.push(message),
    onStateChange: (state) => states.push(state),
  });
}

describe('live socket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    server = new FakeAgoraServer();
    server.install();
    states = [];
    received = [];
    sinceForResume = null;
    socket = makeSocket();
  });

  afterEach(() => {
    socket.close();
    server.restore();
    vi.useRealTimers();
  });

  it('builds a same origin resume url that carries no credential', () => {
    expect(agoraSocketUrl('doc-1', 12)).toBe(`ws://${location.host}/agora/ws?doc=doc-1&since=12`);
  });

  it('a first connect claims no since, so the server sends the snapshot', () => {
    expect(agoraSocketUrl('doc-1', null)).toBe(`ws://${location.host}/agora/ws?doc=doc-1`);
    socket.connect();
    expect(server.connection.url).not.toContain('since');
  });

  it('offers the bearer token as the second subprotocol', () => {
    socket.connect();
    expect(server.connection.protocols).toEqual(['bearer', 'jwt-token']);
    expect(server.connection.offeredToken).toBe('jwt-token');
  });

  it('reports state transitions and hands messages to the caller', () => {
    socket.connect();
    expect(states).toEqual(['connecting']);
    server.accept();
    expect(states).toEqual(['connecting', 'open']);
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('snapshot');
  });

  it('refuses to send before the handshake completes', () => {
    socket.connect();
    expect(socket.send({ type: 'op', clientSeq: 1, key: 'meta/name', value: 'x' })).toBe(false);
    server.accept();
    expect(socket.send({ type: 'op', clientSeq: 1, key: 'meta/name', value: 'x' })).toBe(true);
  });

  it('doubles the reconnect delay while the connection keeps failing', () => {
    socket.connect();
    for (const delay of [500, 1000, 2000, 4000]) {
      server.connection.dropConnection();
      expect(states.at(-1)).toBe('reconnecting');
      const connectionsBefore = server.connections.length;
      vi.advanceTimersByTime(delay - 1);
      expect(server.connections).toHaveLength(connectionsBefore);
      vi.advanceTimersByTime(1);
      expect(server.connections).toHaveLength(connectionsBefore + 1);
    }
  });

  it('caps the reconnect delay', () => {
    socket.connect();
    for (const delay of [500, 1000, 2000, 4000, 8000, 15000, 15000]) {
      server.connection.dropConnection();
      vi.advanceTimersByTime(delay);
    }
    const attempts = server.connections.length;
    server.connection.dropConnection();
    vi.advanceTimersByTime(14999);
    expect(server.connections).toHaveLength(attempts);
    vi.advanceTimersByTime(1);
    expect(server.connections).toHaveLength(attempts + 1);
  });

  it('resets the backoff after a successful handshake', () => {
    socket.connect();
    server.connection.dropConnection();
    vi.advanceTimersByTime(500);
    server.connection.dropConnection();
    vi.advanceTimersByTime(1000);
    server.accept();

    server.connection.dropConnection();
    const attempts = server.connections.length;
    vi.advanceTimersByTime(499);
    expect(server.connections).toHaveLength(attempts);
    vi.advanceTimersByTime(1);
    expect(server.connections).toHaveLength(attempts + 1);
  });

  it('resumes from the caller sequence on reconnect', () => {
    socket.connect();
    server.accept();
    sinceForResume = 9;
    server.connection.dropConnection();
    vi.advanceTimersByTime(500);
    expect(server.connection.sinceParameter).toBe(9);
  });

  it('stops reconnecting once closed by the caller', () => {
    socket.connect();
    server.accept();
    socket.close();
    expect(states.at(-1)).toBe('closed');
    const attempts = server.connections.length;
    vi.advanceTimersByTime(60000);
    expect(server.connections).toHaveLength(attempts);
  });
});
