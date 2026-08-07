import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '../../src/live/liveStore';
import {
  attachPresenceBroadcast,
  cursorElement,
  peerColor,
} from '../../src/live/MapPresence';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

type MapMouseHandler = (event: { lngLat: { lng: number; lat: number } }) => void;

function fakePresenceMap() {
  const handlers = new Map<string, MapMouseHandler>();
  return {
    handlers,
    getCenter: () => ({ lng: 10, lat: 20 }),
    getZoom: () => 5,
    on: (event: string, handler: MapMouseHandler) => {
      handlers.set(event, handler);
    },
    off: (event: string) => {
      handlers.delete(event);
    },
  };
}

let server: FakeAgoraServer;

describe('map presence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    server = new FakeAgoraServer();
    server.install();
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit' });
    server.accept();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    vi.useRealTimers();
  });

  it('sends the pointer and viewport of the last move in the interval', () => {
    const map = fakePresenceMap();
    attachPresenceBroadcast(map);
    const move = map.handlers.get('mousemove');
    if (!move) throw new Error('mousemove was not attached');

    move({ lngLat: { lng: 1, lat: 2 } });
    move({ lngLat: { lng: 3, lat: 4 } });
    vi.advanceTimersByTime(100);

    expect(server.connection.presenceSent).toEqual([
      {
        type: 'presence',
        cursor: [3, 4],
        selection: [],
        viewport: { center: [10, 20], zoom: 5 },
      },
    ]);
  });

  it('clears the pointer when it leaves the map', () => {
    const map = fakePresenceMap();
    attachPresenceBroadcast(map);
    map.handlers.get('mouseout')?.({ lngLat: { lng: 0, lat: 0 } });
    vi.advanceTimersByTime(100);
    expect(server.connection.presenceSent.at(-1)?.cursor).toBeNull();
  });

  it('stops sending once detached', () => {
    const map = fakePresenceMap();
    const detach = attachPresenceBroadcast(map);
    detach();
    expect(map.handlers.size).toBe(0);
  });

  it('labels a cursor with the peer name and colour', () => {
    const element = cursorElement('Ada Lovelace', '#a78bfa');
    expect(element.dataset.peerName).toBe('Ada Lovelace');
    expect(element.textContent).toBe('Ada Lovelace');
    expect(element.innerHTML).toContain('rgb(167, 139, 250)');
  });

  it('gives one actor the same colour every time', () => {
    expect(peerColor('ada')).toBe(peerColor('ada'));
    expect(peerColor('ada')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
