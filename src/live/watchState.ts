import { create } from 'zustand';
import type {
  RegionWatch,
  ServerWatchReadingMessage,
  ServerWatchesMessage,
  WatchReading,
} from './types';

/**
 * Readings one watch keeps in the browser. Agora holds far more and answers for
 * them over the readings route, so this only has to cover what the panel shows
 * between two of those calls.
 */
export const MAX_READINGS_KEPT = 200;

/** Frames that carry watch state rather than document state. */
export type WatchMessage = ServerWatchesMessage | ServerWatchReadingMessage;

interface WatchStateStore {
  watches: Record<string, RegionWatch>;
  /** newest first, keyed by watch id */
  readings: Record<string, WatchReading[]>;
  receive: (message: WatchMessage) => void;
  /** what the watches route answered, which is where a create or a delete lands */
  setWatches: (watches: RegionWatch[]) => void;
  clear: () => void;
}

function byId(watches: RegionWatch[]): Record<string, RegionWatch> {
  return Object.fromEntries(watches.map((watch) => [watch.id, watch]));
}

/** The newest reading of a watch, or undefined before it has run for us. */
export function latestReading(
  readings: Record<string, WatchReading[]>,
  watchId: string,
): WatchReading | undefined {
  return readings[watchId]?.[0];
}

export const useWatchStateStore = create<WatchStateStore>((set) => ({
  watches: {},
  readings: {},

  receive: (message) => {
    if (message.type === 'watches') {
      set({ watches: byId(message.watches) });
      return;
    }
    set((state) => {
      const reading: WatchReading = {
        at: message.at,
        value: message.value,
        count: message.count,
        tripped: message.tripped,
      };
      const kept = [reading, ...(state.readings[message.watch] ?? [])].slice(
        0,
        MAX_READINGS_KEPT,
      );
      const known = state.watches[message.watch];
      // agora clears last_error on the run that stored a reading, so a watch
      // that answered again stops showing why it once did not
      const watches = known
        ? {
            ...state.watches,
            [message.watch]: { ...known, lastRunAt: message.at, lastError: null },
          }
        : state.watches;
      return { readings: { ...state.readings, [message.watch]: kept }, watches };
    });
  },

  setWatches: (watches) => set({ watches: byId(watches) }),

  clear: () => set({ watches: {}, readings: {} }),
}));
