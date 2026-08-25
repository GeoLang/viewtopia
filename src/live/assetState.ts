import { create } from 'zustand';
import type {
  AssetBreakpoint,
  AssetRule,
  AssetSnapshot,
  ServerAssetsMessage,
  ServerLivenessMessage,
  ServerReadingsMessage,
} from './types';

/** The latest value of one reading kind for one asset. */
export interface AssetValue {
  value: number;
  at: string;
}

export interface AssetState {
  feed: string;
  online: boolean;
  /** keyed by reading kind */
  values: Record<string, AssetValue>;
}

/** Frames that carry asset state rather than document state. */
export type AssetMessage = ServerReadingsMessage | ServerAssetsMessage | ServerLivenessMessage;

interface AssetStateStore {
  assets: Record<string, AssetState>;
  /** the past moment the map is showing, null while it follows the live feed */
  historyAt: string | null;
  history: Record<string, AssetState> | null;
  receive: (message: AssetMessage) => void;
  showHistory: (at: string, assets: AssetSnapshot[]) => void;
  showLive: () => void;
  clear: () => void;
}

/** A reading for an asset agora never announced still has to land somewhere. */
function blankAsset(feed = ''): AssetState {
  return { feed, online: true, values: {} };
}

function assetsFromSnapshots(snapshots: AssetSnapshot[]): Record<string, AssetState> {
  return Object.fromEntries(
    snapshots.map((snapshot) => [
      snapshot.asset,
      {
        feed: snapshot.feed,
        online: snapshot.online,
        values: Object.fromEntries(
          snapshot.values.map((value) => [value.kind, { value: value.value, at: value.at }]),
        ),
      },
    ]),
  );
}

/**
 * What the map and the inspector show: the past moment while the scrubber holds
 * one, otherwise whatever the feed last sent. Live frames keep landing in
 * `assets` either way, so going back to live needs no request.
 */
export function visibleAssets(state: AssetStateStore): Record<string, AssetState> {
  return state.historyAt !== null && state.history ? state.history : state.assets;
}

export const useAssetStateStore = create<AssetStateStore>((set) => ({
  assets: {},
  historyAt: null,
  history: null,

  receive: (message) => {
    if (message.type === 'assets') {
      set({ assets: assetsFromSnapshots(message.assets) });
      return;
    }
    if (message.type === 'readings') {
      set((state) => {
        const assets = { ...state.assets };
        for (const reading of message.readings) {
          const known = assets[reading.asset] ?? blankAsset(message.feed);
          assets[reading.asset] = {
            ...known,
            values: {
              ...known.values,
              [reading.kind]: { value: reading.value, at: reading.at },
            },
          };
        }
        return { assets };
      });
      return;
    }
    set((state) => {
      const known = state.assets[message.asset];
      if (!known) return { assets: state.assets };
      return {
        assets: { ...state.assets, [message.asset]: { ...known, online: message.online } },
      };
    });
  },

  showHistory: (at, assets) => set({ historyAt: at, history: assetsFromSnapshots(assets) }),

  showLive: () => set({ historyAt: null, history: null }),

  clear: () => set({ assets: {}, historyAt: null, history: null }),
}));

function ascendingByValue(breakpoints: AssetBreakpoint[]): AssetBreakpoint[] {
  return [...breakpoints].sort((left, right) => left.value - right.value);
}

/** What the map paints one asset, from the rule and whatever the store knows. */
export function colorForAsset(rule: AssetRule, asset: AssetState | undefined): string {
  if (!asset) return rule.defaultColor;
  if (!asset.online) return rule.offlineColor;
  const reading = asset.values[rule.kind];
  if (!reading) return rule.defaultColor;
  let color = rule.defaultColor;
  for (const breakpoint of ascendingByValue(rule.breakpoints)) {
    if (breakpoint.value > reading.value) break;
    color = breakpoint.color;
  }
  return color;
}

/** Breakpoints as the rule form writes them: `0:#2ecc71, 25:#f1c40f`. */
export function parseBreakpoints(text: string): AssetBreakpoint[] {
  const breakpoints: AssetBreakpoint[] = [];
  for (const entry of text.split(',')) {
    const separator = entry.lastIndexOf(':');
    if (separator < 0) continue;
    const text = entry.slice(0, separator).trim();
    const color = entry.slice(separator + 1).trim();
    // Number('') is 0, so an entry with no value would read as a zero breakpoint
    if (text.length === 0 || color.length === 0) continue;
    const value = Number(text);
    if (!Number.isFinite(value)) continue;
    breakpoints.push({ value, color });
  }
  return ascendingByValue(breakpoints);
}

export function formatBreakpoints(breakpoints: AssetBreakpoint[]): string {
  return breakpoints.map((breakpoint) => `${breakpoint.value}:${breakpoint.color}`).join(', ');
}
