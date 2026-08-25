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
import type { AnalysisKind, AnalysisResult } from './analysis/run';

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
  /** Length of the trailing time window in ms; 0 draws every event. */
  trailDuration: number;
  playbackSpeed: number;

  // UI state
  panelOpen: boolean;
  /** Cube view: the camera is pitched and the sweep plane and ground shadows draw. */
  cubeView: boolean;
  selectedEntityId: string | null;
  flyToTarget: { lng: number; lat: number; zoom?: number } | null;
  /** Result of the last CSV import; stays until the next import or a panel close. */
  importStatus: string | null;

  // Analysis
  /** Result of the last analysis run; also what the analysis deck layers draw. */
  analysisResult: AnalysisResult | null;
  /** The analysis currently in the worker, so its button can show progress. */
  analysisRunning: AnalysisKind | null;
  analysisError: string | null;

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

  // Analysis
  startAnalysis: (kind: AnalysisKind) => void;
  finishAnalysis: (result: AnalysisResult) => void;
  failAnalysis: (message: string) => void;
  clearAnalysis: () => void;

  // UI
  toggleCubeView: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  setImportStatus: (status: string | null) => void;
  selectEntity: (id: string | null) => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  clearFlyTo: () => void;
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
  trailDuration: 0,
  playbackSpeed: 1,

  panelOpen: false,
  cubeView: false,
  selectedEntityId: null,
  flyToTarget: null,
  importStatus: null,

  analysisResult: null,
  analysisRunning: null,
  analysisError: null,

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

  startAnalysis: (analysisRunning) =>
    set({ analysisRunning, analysisError: null, analysisResult: null }),
  finishAnalysis: (analysisResult) => set({ analysisResult, analysisRunning: null }),
  failAnalysis: (analysisError) => set({ analysisError, analysisRunning: null }),
  clearAnalysis: () => set({ analysisResult: null, analysisError: null }),

  toggleCubeView: () => set((s) => ({ cubeView: !s.cubeView })),

  // closing drops the import summary, so a reopened panel starts clean
  togglePanel: () =>
    set((s) => (s.panelOpen ? { panelOpen: false, importStatus: null } : { panelOpen: true })),
  closePanel: () => set({ panelOpen: false, importStatus: null }),
  setImportStatus: (importStatus) => set({ importStatus }),
  selectEntity: (selectedEntityId) => set({ selectedEntityId }),
  flyTo: (lng, lat, zoom) => set({ flyToTarget: { lng, lat, zoom } }),
  clearFlyTo: () => set({ flyToTarget: null }),
}));
