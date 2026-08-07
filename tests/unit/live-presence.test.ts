import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '../../src/live/liveStore';
import {
  attachCameraFollow,
  attachPresenceBroadcast,
  cursorElement,
  peerColor,
} from '../../src/live/MapPresence';
import type { LiveViewport } from '../../src/live/types';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

type MapMouseHandler = (event: { lngLat: { lng: number; lat: number } }) => void;
type CameraHandler = (event: { originalEvent?: unknown }) => void;

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

function fakeFollowMap() {
  const handlers = new Map<string, CameraHandler>();
  const jumps: Array<{ center: [number, number]; zoom: number }> = [];
  return {
    handlers,
    jumps,
    jumpTo: (options: { center: [number, number]; zoom: number }) => {
      jumps.push(options);
    },
    on: (event: string, handler: CameraHandler) => {
      handlers.set(event, handler);
    },
    off: (event: string) => {
      handlers.delete(event);
    },
  };
}

/** A presence frame from a peer, the only place a followable viewport comes from. */
function peerViewport(actor: string, viewport: LiveViewport): void {
  server.connection.deliver({
    type: 'presence',
    actor,
    cursor: null,
    selection: [],
    viewport,
  });
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

  it('clears the pointer when it leaves the map but keeps the viewport followable', () => {
    const map = fakePresenceMap();
    attachPresenceBroadcast(map);
    map.handlers.get('mouseout')?.({ lngLat: { lng: 0, lat: 0 } });
    vi.advanceTimersByTime(100);
    const sent = server.connection.presenceSent.at(-1);
    expect(sent?.cursor).toBeNull();
    expect(sent?.viewport).toEqual({ center: [10, 20], zoom: 5 });
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

describe('camera follow', () => {
  beforeEach(() => {
    server = new FakeAgoraServer();
    server.install();
    useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit' });
    server.accept();
    server.sendPeers([{ actor: 'ada', name: 'Ada', role: 'edit' }]);
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
  });

  it('starts on the viewport the followed peer already reported', () => {
    peerViewport('ada', { center: [12, 34], zoom: 7 });
    const map = fakeFollowMap();
    useLiveStore.getState().setFollowedActor('ada');
    attachCameraFollow(map, 'ada');
    expect(map.jumps).toEqual([{ center: [12, 34], zoom: 7 }]);
  });

  it('tracks every viewport the followed peer sends after that', () => {
    const map = fakeFollowMap();
    useLiveStore.getState().setFollowedActor('ada');
    attachCameraFollow(map, 'ada');
    peerViewport('ada', { center: [1, 2], zoom: 3 });
    peerViewport('ada', { center: [4, 5], zoom: 6 });
    expect(map.jumps).toEqual([
      { center: [1, 2], zoom: 3 },
      { center: [4, 5], zoom: 6 },
    ]);
  });

  it('ignores the viewport of a peer we are not following', () => {
    const map = fakeFollowMap();
    useLiveStore.getState().setFollowedActor('ada');
    attachCameraFollow(map, 'ada');
    peerViewport('grace', { center: [1, 2], zoom: 3 });
    expect(map.jumps).toEqual([]);
  });

  it('stops following on a local camera gesture', () => {
    const map = fakeFollowMap();
    useLiveStore.getState().setFollowedActor('ada');
    const detach = attachCameraFollow(map, 'ada');

    map.handlers.get('movestart')?.({ originalEvent: new MouseEvent('mousedown') });

    expect(useLiveStore.getState().followedActor).toBeNull();
    detach();
    expect(map.handlers.size).toBe(0);
  });

  it('keeps following through the camera move it made itself', () => {
    const map = fakeFollowMap();
    useLiveStore.getState().setFollowedActor('ada');
    attachCameraFollow(map, 'ada');

    // jumpTo fires movestart with no originalEvent, which is the only thing
    // separating our own move from the user grabbing the map
    peerViewport('ada', { center: [1, 2], zoom: 3 });
    map.handlers.get('movestart')?.({});

    expect(useLiveStore.getState().followedActor).toBe('ada');
    expect(map.jumps).toHaveLength(1);
  });

  it('stops following a peer that left the session', () => {
    useLiveStore.getState().setFollowedActor('ada');
    server.sendPeers([{ actor: 'grace', name: 'Grace', role: 'edit' }]);
    expect(useLiveStore.getState().followedActor).toBeNull();
  });

  it('follows nobody once the session ends', () => {
    useLiveStore.getState().setFollowedActor('ada');
    useLiveStore.getState().disconnect();
    expect(useLiveStore.getState().followedActor).toBeNull();
  });
});
