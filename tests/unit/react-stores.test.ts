import { describe, it, expect } from 'vitest';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { useCollabStore } from '../../src/store/collaboration';
import { useLiveKitStore } from '../../src/store/livekit';

describe('app store', () => {
  it('toggles nav', () => {
    const { toggleNav } = useAppStore.getState();
    // chat starts closed so the map owns the viewport
    expect(useAppStore.getState().navOpened).toBe(false);
    toggleNav();
    expect(useAppStore.getState().navOpened).toBe(true);
    toggleNav();
    expect(useAppStore.getState().navOpened).toBe(false);
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

  // the spec must survive on the message: ChatPanel replays it on click, and it
  // is persisted, so a reply stays replayable after a refresh
  it('keeps a ui_spec on the last assistant message', () => {
    const store = useChatStore.getState();
    if (!store.activeSessionId) store.createSession('Spec Test');
    const spec = {
      type: 'map' as const,
      layers: [{ name: 'Cafes', file: 'outputs/cafes.gpkg', color: '#ff8800' }],
      center: [2.2945, 48.8584] as [number, number],
      zoom: 16,
    };

    store.addMessage({ role: 'user', content: 'cafes near the Eiffel Tower' });
    store.addMessage({ role: 'assistant', content: 'Here are the cafes.' });
    useChatStore.getState().setLastMapSpec(spec);

    const msgs = useChatStore.getState().activeMessages();
    expect(msgs[msgs.length - 1].mapSpec).toEqual(spec);
    // the user's prompt must not become replayable
    expect(msgs[msgs.length - 2].mapSpec).toBeUndefined();
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
    expect(state.error).toBeNull();
  });

  it('sets user name', () => {
    useCollabStore.getState().setUserName('TestUser');
    expect(useCollabStore.getState().userName).toBe('TestUser');
    useCollabStore.getState().setUserName('Anonymous');
  });

  it('has no identity of its own: the server assigns one on connect', () => {
    expect(useCollabStore.getState().userId).toBeNull();
  });
});

describe('livekit store', () => {
  it('starts disconnected', () => {
    const state = useLiveKitStore.getState();
    expect(state.connected).toBe(false);
    expect(state.micEnabled).toBe(false);
    expect(state.camEnabled).toBe(false);
    expect(state.participants).toEqual([]);
  });

  it('rejects join without livekitUrl', async () => {
    // Ensure livekitUrl is empty (default)
    useAppStore.getState().updateSettings({ livekitUrl: '' });
    await expect(useLiveKitStore.getState().join('room', 'token')).rejects.toThrow(
      'LiveKit URL not configured',
    );
  });
});

describe('settings livekitUrl', () => {
  it('has empty default', () => {
    useAppStore.getState().updateSettings({ livekitUrl: '' });
    expect(useAppStore.getState().settings.livekitUrl).toBe('');
  });

  it('persists livekitUrl', () => {
    useAppStore.getState().updateSettings({ livekitUrl: 'wss://livekit.example.com' });
    expect(useAppStore.getState().settings.livekitUrl).toBe('wss://livekit.example.com');
    useAppStore.getState().updateSettings({ livekitUrl: '' });
  });
});

describe('settings selfHostedBasemapUrl', () => {
  it('has empty default', () => {
    expect(useAppStore.getState().settings.selfHostedBasemapUrl).toBe('');
  });

  it('persists the URL to storage', () => {
    const url = 'https://files.example.com/planet.pmtiles';
    useAppStore.getState().updateSettings({ selfHostedBasemapUrl: url });
    expect(useAppStore.getState().settings.selfHostedBasemapUrl).toBe(url);
    const stored = JSON.parse(localStorage.getItem('viewtopia-app') ?? '{}');
    expect(stored.state.settings.selfHostedBasemapUrl).toBe(url);
    useAppStore.getState().updateSettings({ selfHostedBasemapUrl: '' });
  });

  it('backfills settings keys missing from an older persisted state', () => {
    // an older build persisted settings without selfHostedBasemapUrl; rehydrating
    // must fill it from defaults, not leave it undefined (that crashed SettingsPanel)
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { settings: { showMinimap: false } }, version: 0 }),
    );
    void useAppStore.persist.rehydrate();
    const s = useAppStore.getState().settings;
    expect(s.selfHostedBasemapUrl).toBe('');
    expect(s.showMinimap).toBe(false); // persisted value still wins
    expect(s.defaultBasemap).toBe('liberty'); // other defaults present
    localStorage.removeItem('viewtopia-app');
    void useAppStore.persist.rehydrate();
  });
});

describe('settings basemap', () => {
  it('persists a vector basemap choice', () => {
    useAppStore.getState().setBasemap('positron');
    const stored = JSON.parse(localStorage.getItem('viewtopia-app') ?? '{}');
    expect(stored.state.basemap).toBe('positron');
    useAppStore.getState().setBasemap('liberty');
  });
});
