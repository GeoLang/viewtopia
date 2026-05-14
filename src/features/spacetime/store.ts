import { create } from 'zustand';
import type {
  Entity,
  Track,
  Link,
  Geofence,
  Alert,
  Case,
  TimeRange,
} from './types';

interface SpaceTimeState {
  // Data
  entities: Map<string, Entity>;
  tracks: Track[];
  links: Link[];
  geofences: Geofence[];
  alerts: Alert[];
  cases: Case[];

  // Playback
  timeRange: TimeRange;
  currentTime: number;
  playing: boolean;
  trailDuration: number;
  playbackSpeed: number;

  // UI state
  panelOpen: boolean;
  selectedEntityId: string | null;

  // Entity CRUD
  addEntity: (entity: Entity) => void;
  updateEntity: (id: string, updates: Partial<Entity>) => void;
  removeEntity: (id: string) => void;

  // Track management
  addTrack: (track: Track) => void;
  clearTracks: () => void;

  // Links
  addLink: (link: Link) => void;
  removeLink: (id: string) => void;

  // Geofences
  addGeofence: (fence: Geofence) => void;
  removeGeofence: (id: string) => void;

  // Alerts
  addAlert: (alert: Alert) => void;
  clearAlerts: () => void;

  // Cases
  addCase: (c: Case) => void;
  updateCase: (id: string, updates: Partial<Case>) => void;
  removeCase: (id: string) => void;

  // Playback controls
  setCurrentTime: (t: number) => void;
  setTimeRange: (r: TimeRange) => void;
  setPlaying: (v: boolean) => void;
  setTrailDuration: (d: number) => void;
  setPlaybackSpeed: (s: number) => void;

  // UI
  togglePanel: () => void;
  selectEntity: (id: string | null) => void;
}

export const useSpaceTimeStore = create<SpaceTimeState>((set) => ({
  entities: new Map(),
  tracks: [],
  links: [],
  geofences: [],
  alerts: [],
  cases: [],

  timeRange: { min: 0, max: 0 },
  currentTime: 0,
  playing: false,
  trailDuration: 3600_000,
  playbackSpeed: 1,

  panelOpen: false,
  selectedEntityId: null,

  addEntity: (entity) =>
    set((s) => {
      const m = new Map(s.entities);
      m.set(entity.id, entity);
      return { entities: m };
    }),

  updateEntity: (id, updates) =>
    set((s) => {
      const m = new Map(s.entities);
      const e = m.get(id);
      if (e) m.set(id, { ...e, ...updates, updatedAt: Date.now() });
      return { entities: m };
    }),

  removeEntity: (id) =>
    set((s) => {
      const m = new Map(s.entities);
      m.delete(id);
      return { entities: m };
    }),

  addTrack: (track) => set((s) => ({ tracks: [...s.tracks, track] })),
  clearTracks: () => set({ tracks: [] }),

  addLink: (link) => set((s) => ({ links: [...s.links, link] })),
  removeLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),

  addGeofence: (fence) => set((s) => ({ geofences: [...s.geofences, fence] })),
  removeGeofence: (id) =>
    set((s) => ({ geofences: s.geofences.filter((f) => f.id !== id) })),

  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
  clearAlerts: () => set({ alerts: [] }),

  addCase: (c) => set((s) => ({ cases: [...s.cases, c] })),
  updateCase: (id, updates) =>
    set((s) => ({
      cases: s.cases.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c,
      ),
    })),
  removeCase: (id) => set((s) => ({ cases: s.cases.filter((c) => c.id !== id) })),

  setCurrentTime: (currentTime) => set({ currentTime }),
  setTimeRange: (timeRange) => set({ timeRange }),
  setPlaying: (playing) => set({ playing }),
  setTrailDuration: (trailDuration) => set({ trailDuration }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  selectEntity: (selectedEntityId) => set({ selectedEntityId }),
}));
