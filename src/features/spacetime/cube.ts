import type { SpaceTimeEvent, TimeRange, Track } from './types';

/** Map height in metres that the whole loaded time range spans in cube view. */
export const CUBE_ELEVATION_SPAN = 50000;

/** Track points above this count are strided down on import. */
export const MAX_TRACK_POINTS = 100_000;

/** Smallest half-extent the sweep plane gets, so a single-point import still shows one. */
const SWEEP_PLANE_MIN_PAD_DEGREES = 0.001;

const SWEEP_PLANE_PAD_FRACTION = 0.05;

export type Bounds = { west: number; south: number; east: number; north: number };

export function timeToElevation(timestamp: number, range: TimeRange): number {
  if (range.max === range.min) return 0;
  return ((timestamp - range.min) / (range.max - range.min)) * CUBE_ELEVATION_SPAN;
}

/** First index whose timestamp fails `before`. events must be sorted by timestamp. */
function partitionPoint(
  events: SpaceTimeEvent[],
  before: (timestamp: number) => boolean,
): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (before(events[mid].timestamp)) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Events in the window of `duration` ending at `currentTime`, both ends included.
 * A duration of 0 or less means no window, so every event comes back.
 */
export function eventsInWindow(
  events: SpaceTimeEvent[],
  currentTime: number,
  duration: number,
): SpaceTimeEvent[] {
  if (duration <= 0) return events;
  const windowStart = currentTime - duration;
  const start = partitionPoint(events, (t) => t < windowStart);
  const end = partitionPoint(events, (t) => t <= currentTime);
  return events.slice(start, end);
}

export function tracksBounds(tracks: Track[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const track of tracks) {
    for (const event of track.events) {
      if (!Number.isFinite(event.lng) || !Number.isFinite(event.lat)) continue;
      west = Math.min(west, event.lng);
      east = Math.max(east, event.lng);
      south = Math.min(south, event.lat);
      north = Math.max(north, event.lat);
    }
  }
  if (west === Infinity) return null;
  return { west, south, east, north };
}

/** Padded rectangle ring at `elevation`, the horizontal plane deck draws for "now". */
export function sweepPlanePolygon(
  bounds: Bounds,
  elevation: number,
): [number, number, number][] {
  const padLongitude = Math.max(
    (bounds.east - bounds.west) * SWEEP_PLANE_PAD_FRACTION,
    SWEEP_PLANE_MIN_PAD_DEGREES,
  );
  const padLatitude = Math.max(
    (bounds.north - bounds.south) * SWEEP_PLANE_PAD_FRACTION,
    SWEEP_PLANE_MIN_PAD_DEGREES,
  );
  const west = bounds.west - padLongitude;
  const east = bounds.east + padLongitude;
  const south = bounds.south - padLatitude;
  const north = bounds.north + padLatitude;
  return [
    [west, south, elevation],
    [east, south, elevation],
    [east, north, elevation],
    [west, north, elevation],
  ];
}

export interface DownsampleResult {
  tracks: Track[];
  kept: number;
  dropped: number;
}

/**
 * Keep every Nth event of every track, with N from the total point count, so
 * each track thins by the same factor and keeps its shape. The last event of a
 * track is always kept, otherwise a thinned track stops short of where it ended.
 */
export function downsampleTracks(tracks: Track[], cap = MAX_TRACK_POINTS): DownsampleResult {
  const total = tracks.reduce((count, track) => count + track.events.length, 0);
  if (total <= cap) return { tracks, kept: total, dropped: 0 };

  const stride = Math.ceil(total / cap);
  const thinned = tracks.map((track) => {
    if (track.events.length === 0) return track;
    const events = track.events.filter((_, index) => index % stride === 0);
    const last = track.events[track.events.length - 1];
    if (events[events.length - 1] !== last) events.push(last);
    return { ...track, events };
  });

  const kept = thinned.reduce((count, track) => count + track.events.length, 0);
  return { tracks: thinned, kept, dropped: total - kept };
}
