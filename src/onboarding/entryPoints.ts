import { create } from 'zustand';

export type EntryPoint = 'create-project' | 'live-session';

interface EntryPointState {
  /** what the first-run overlay asked for, held until its consumer mounts */
  requested: EntryPoint | null;
  request: (point: EntryPoint) => void;
  consume: (point: EntryPoint) => void;
}

export const useEntryPointStore = create<EntryPointState>((set) => ({
  requested: null,
  request: (point) => set({ requested: point }),
  consume: (point) => set((state) => (state.requested === point ? { requested: null } : state)),
}));
