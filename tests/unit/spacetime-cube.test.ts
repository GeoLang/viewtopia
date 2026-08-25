import { describe, it, expect } from 'vitest';
import {
  CUBE_ELEVATION_SPAN,
  MAX_TRACK_POINTS,
  downsampleTracks,
  eventsInWindow,
  sweepPlanePolygon,
  timeToElevation,
  tracksBounds,
} from '../../src/features/spacetime/cube';
import type { SpaceTimeEvent, Track } from '../../src/features/spacetime/types';

function event(timestamp: number, lng = 0, lat = 0): SpaceTimeEvent {
  return { id: `e${timestamp}`, entityId: 'entity', timestamp, lng, lat };
}

function track(events: SpaceTimeEvent[], id = 't1'): Track {
  return { id, entityId: 'entity', events };
}

describe('timeToElevation', () => {
  const range = { min: 1000, max: 5000 };

  it('spreads the time range over the cube height', () => {
    expect(timeToElevation(1000, range)).toBe(0);
    expect(timeToElevation(5000, range)).toBe(CUBE_ELEVATION_SPAN);
    expect(timeToElevation(3000, range)).toBe(CUBE_ELEVATION_SPAN / 2);
  });

  it('flattens to the ground when every event shares one timestamp', () => {
    expect(timeToElevation(1000, { min: 1000, max: 1000 })).toBe(0);
  });
});

describe('eventsInWindow', () => {
  const events = [event(100), event(200), event(300), event(400), event(500)];

  it('returns every event when the window is off', () => {
    expect(eventsInWindow(events, 300, 0)).toBe(events);
    expect(eventsInWindow(events, 300, -1)).toBe(events);
  });

  it('keeps the events in the window ending at currentTime, both ends included', () => {
    expect(eventsInWindow(events, 400, 200).map((e) => e.timestamp)).toEqual([200, 300, 400]);
  });

  it('drops everything after currentTime', () => {
    expect(eventsInWindow(events, 250, 1000).map((e) => e.timestamp)).toEqual([100, 200]);
  });

  it('returns nothing when the window sits before the data', () => {
    expect(eventsInWindow(events, 50, 10)).toEqual([]);
  });
});

describe('tracksBounds', () => {
  it('covers every track', () => {
    const bounds = tracksBounds([
      track([event(1, -122.5, 37.7), event(2, -122.4, 37.8)], 'a'),
      track([event(1, -122.6, 37.6)], 'b'),
    ]);
    expect(bounds).toEqual({ west: -122.6, south: 37.6, east: -122.4, north: 37.8 });
  });

  it('is null without usable coordinates', () => {
    expect(tracksBounds([])).toBeNull();
    expect(tracksBounds([track([event(1, NaN, NaN)])])).toBeNull();
  });
});

describe('sweepPlanePolygon', () => {
  const bounds = { west: -10, south: -20, east: 10, north: 20 };

  it('sits flat at the given elevation and pads past the data', () => {
    const ring = sweepPlanePolygon(bounds, 1234);
    expect(ring).toHaveLength(4);
    for (const corner of ring) expect(corner[2]).toBe(1234);
    const longitudes = ring.map((c) => c[0]);
    const latitudes = ring.map((c) => c[1]);
    expect(Math.min(...longitudes)).toBeCloseTo(-11);
    expect(Math.max(...longitudes)).toBeCloseTo(11);
    expect(Math.min(...latitudes)).toBeCloseTo(-22);
    expect(Math.max(...latitudes)).toBeCloseTo(22);
  });

  it('still has area when every point shares one position', () => {
    const point = { west: 5, south: 5, east: 5, north: 5 };
    const ring = sweepPlanePolygon(point, 0);
    expect(Math.max(...ring.map((c) => c[0]))).toBeGreaterThan(
      Math.min(...ring.map((c) => c[0])),
    );
    expect(Math.max(...ring.map((c) => c[1]))).toBeGreaterThan(
      Math.min(...ring.map((c) => c[1])),
    );
  });

  it('tracks the playhead up the cube', () => {
    const range = { min: 0, max: 100 };
    const low = sweepPlanePolygon(bounds, timeToElevation(25, range));
    const high = sweepPlanePolygon(bounds, timeToElevation(75, range));
    expect(low[0][2]).toBe(CUBE_ELEVATION_SPAN * 0.25);
    expect(high[0][2]).toBe(CUBE_ELEVATION_SPAN * 0.75);
  });
});

describe('downsampleTracks', () => {
  const events = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, i) => event(offset + i, i * 0.001, i * 0.001));

  it('leaves an import under the cap alone', () => {
    const tracks = [track(events(10))];
    const result = downsampleTracks(tracks, 100);
    expect(result.tracks).toBe(tracks);
    expect(result).toMatchObject({ kept: 10, dropped: 0 });
  });

  it('strides every track by the same factor and reports the loss', () => {
    const tracks = [track(events(100), 'a'), track(events(300, 1000), 'b')];
    const result = downsampleTracks(tracks, 100);

    // 400 points over a cap of 100 is a stride of 4
    expect(result.tracks[0].events.map((e) => e.timestamp).slice(0, 3)).toEqual([0, 4, 8]);
    expect(result.tracks[1].events.map((e) => e.timestamp).slice(0, 3)).toEqual([1000, 1004, 1008]);
    expect(result.kept).toBeLessThanOrEqual(110);
    expect(result.kept + result.dropped).toBe(400);
  });

  it('keeps the first and last event of every track, so shape survives', () => {
    const tracks = [track(events(1000))];
    const result = downsampleTracks(tracks, 10);
    const kept = result.tracks[0].events;
    expect(kept[0].timestamp).toBe(0);
    expect(kept[kept.length - 1].timestamp).toBe(999);
    expect(kept[kept.length - 1]).toBe(tracks[0].events[999]);
  });

  it('does not touch the input tracks', () => {
    const original = track(events(50));
    downsampleTracks([original], 10);
    expect(original.events).toHaveLength(50);
  });

  it('caps a default import at a hundred thousand points', () => {
    const result = downsampleTracks([track(events(MAX_TRACK_POINTS + 100_000))]);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.kept).toBeLessThanOrEqual(MAX_TRACK_POINTS + 1);
  });
});
