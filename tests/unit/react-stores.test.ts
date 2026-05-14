import { describe, it, expect } from 'vitest';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { useCollabStore } from '../../src/store/collaboration';

describe('app store', () => {
  it('toggles nav', () => {
    const { toggleNav } = useAppStore.getState();
    expect(useAppStore.getState().navOpened).toBe(true);
    toggleNav();
    expect(useAppStore.getState().navOpened).toBe(false);
    toggleNav();
    expect(useAppStore.getState().navOpened).toBe(true);
  });

  it('sets active tab and renderer', () => {
    const { setActiveTab, setRenderer } = useAppStore.getState();
    setActiveTab('map');
    expect(useAppStore.getState().activeTab).toBe('map');
    setRenderer('maplibre');
    expect(useAppStore.getState().renderer).toBe('maplibre');
  });

  it('sets backend status', () => {
    const { setBackendStatus } = useAppStore.getState();
    setBackendStatus(true, false);
    expect(useAppStore.getState().tiletopiaOnline).toBe(true);
    expect(useAppStore.getState().geolangOnline).toBe(false);
  });
});

describe('chat store', () => {
  it('creates and manages sessions', () => {
    const store = useChatStore.getState();
    const id = store.createSession('Test Session');
    expect(id).toBeDefined();

    const state = useChatStore.getState();
    expect(state.sessions.length).toBeGreaterThan(0);
    expect(state.activeSessionId).toBe(id);
    expect(state.sessions.find((s) => s.id === id)?.name).toBe('Test Session');
  });

  it('adds messages to active session', () => {
    const store = useChatStore.getState();
    if (!store.activeSessionId) store.createSession('Msg Test');

    store.addMessage({ role: 'user', content: 'Hello!' });
    store.addMessage({ role: 'assistant', content: 'Hi there.' });

    const msgs = useChatStore.getState().activeMessages();
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[msgs.length - 2].content).toBe('Hello!');
    expect(msgs[msgs.length - 1].content).toBe('Hi there.');
  });

  it('appends to last assistant message', () => {
    const store = useChatStore.getState();
    store.addMessage({ role: 'assistant', content: 'Start' });
    store.appendToLast(' + more');
    const msgs = useChatStore.getState().activeMessages();
    expect(msgs[msgs.length - 1].content).toBe('Start + more');
  });
});

describe('spacetime store', () => {
  it('adds and removes entities', () => {
    const store = useSpaceTimeStore.getState();
    store.addEntity({
      id: 'e1',
      name: 'Alice',
      kind: 'person',
      aliases: ['Agent A'],
      color: '#a78bfa',
      properties: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(useSpaceTimeStore.getState().entities.get('e1')?.name).toBe('Alice');

    store.removeEntity('e1');
    expect(useSpaceTimeStore.getState().entities.get('e1')).toBeUndefined();
  });

  it('manages tracks', () => {
    const store = useSpaceTimeStore.getState();
    store.addTrack({
      id: 't1',
      entityId: 'e1',
      events: [
        { id: 'ev1', entityId: 'e1', timestamp: 1000, lng: -73.9, lat: 40.7 },
      ],
    });

    expect(useSpaceTimeStore.getState().tracks.length).toBeGreaterThan(0);
    store.clearTracks();
    expect(useSpaceTimeStore.getState().tracks.length).toBe(0);
  });

  it('manages links', () => {
    const store = useSpaceTimeStore.getState();
    store.addLink({
      id: 'l1',
      sourceId: 'e1',
      targetId: 'e2',
      kind: 'communication',
    });

    expect(useSpaceTimeStore.getState().links.length).toBeGreaterThan(0);
    store.removeLink('l1');
    expect(useSpaceTimeStore.getState().links.find((l) => l.id === 'l1')).toBeUndefined();
  });

  it('manages playback state', () => {
    const store = useSpaceTimeStore.getState();
    store.setTimeRange({ min: 1000, max: 5000 });
    store.setCurrentTime(3000);
    store.setPlaying(true);
    store.setPlaybackSpeed(2);
    store.setTrailDuration(7200000);

    const state = useSpaceTimeStore.getState();
    expect(state.timeRange).toEqual({ min: 1000, max: 5000 });
    expect(state.currentTime).toBe(3000);
    expect(state.playing).toBe(true);
    expect(state.playbackSpeed).toBe(2);
    expect(state.trailDuration).toBe(7200000);
  });

  it('toggles panel and selects entity', () => {
    const store = useSpaceTimeStore.getState();
    const initial = store.panelOpen;
    store.togglePanel();
    expect(useSpaceTimeStore.getState().panelOpen).toBe(!initial);

    store.selectEntity('e1');
    expect(useSpaceTimeStore.getState().selectedEntityId).toBe('e1');
    store.selectEntity(null);
    expect(useSpaceTimeStore.getState().selectedEntityId).toBeNull();
  });
});

describe('settings server URLs', () => {
  it('has default TileTopia and GeoLang URLs', () => {
    const { settings } = useAppStore.getState();
    expect(settings.tiletopiaUrl).toBe('/api/v1');
    expect(settings.geolangUrl).toBe('/agent');
  });

  it('updates server URLs', () => {
    const { updateSettings } = useAppStore.getState();
    updateSettings({ tiletopiaUrl: 'https://tiletopia.example.com/api/v1' });
    updateSettings({ geolangUrl: 'https://geolang.example.com/agent' });
    const { settings } = useAppStore.getState();
    expect(settings.tiletopiaUrl).toBe('https://tiletopia.example.com/api/v1');
    expect(settings.geolangUrl).toBe('https://geolang.example.com/agent');
    // Reset
    updateSettings({ tiletopiaUrl: '/api/v1', geolangUrl: '/agent' });
  });
});

describe('collaboration store', () => {
  it('has initial disconnected state', () => {
    const state = useCollabStore.getState();
    expect(state.connected).toBe(false);
    expect(state.roomId).toBeNull();
    expect(state.users).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.followUserId).toBeNull();
  });

  it('sets user name', () => {
    useCollabStore.getState().setUserName('TestUser');
    expect(useCollabStore.getState().userName).toBe('TestUser');
    useCollabStore.getState().setUserName('Anonymous');
  });

  it('sets follow user', () => {
    useCollabStore.getState().setFollow('user-abc');
    expect(useCollabStore.getState().followUserId).toBe('user-abc');
    useCollabStore.getState().setFollow(null);
    expect(useCollabStore.getState().followUserId).toBeNull();
  });

  it('generates a userId on init', () => {
    const { userId } = useCollabStore.getState();
    expect(userId).toMatch(/^user-[a-z0-9]+$/);
  });
});
