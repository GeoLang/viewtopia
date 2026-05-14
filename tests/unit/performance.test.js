import { describe, it, expect } from 'vitest';
import {
  createBinaryStore, appendEvent, appendTracks, sortByTimestamp,
  getStoreBounds, queryTimeRange, querySpatioTemporal, toBinaryAttributes,
  getEntityEventCounts,
} from '../../src/spacetime/binary-store.js';
import { createEvent, createTrack } from '../../src/spacetime/models.js';
import { queryViewport, buildRenderData, viewportChanged, computeTimeWindow } from '../../src/spacetime/viewport-tiling.js';

describe('binary-store', () => {
  it('creates empty store with capacity', () => {
    const store = createBinaryStore(1000);
    expect(store.length).toBe(0);
    expect(store.capacity).toBe(1000);
    expect(store.timestamps.length).toBe(1000);
  });

  it('appends events', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'entity1', 1000, -122.4, 37.7, 100);
    appendEvent(store, 'entity1', 2000, -122.5, 37.8, 200);
    appendEvent(store, 'entity2', 1500, -122.3, 37.6, 0);

    expect(store.length).toBe(3);
    expect(store.timestamps[0]).toBe(1000);
    expect(store.longitudes[1]).toBe(-122.5);
    expect(store.entityIds.length).toBe(2);
  });

  it('grows capacity when needed', () => {
    const store = createBinaryStore(2);
    appendEvent(store, 'a', 1000, 0, 0);
    appendEvent(store, 'a', 2000, 1, 1);
    appendEvent(store, 'a', 3000, 2, 2); // triggers resize
    expect(store.length).toBe(3);
    expect(store.capacity).toBeGreaterThanOrEqual(3);
    expect(store.timestamps[2]).toBe(3000);
  });

  it('appendTracks batch inserts from track model', () => {
    const track = createTrack('e1', [
      createEvent('e1', 1000, -122.4, 37.7),
      createEvent('e1', 2000, -122.5, 37.8),
    ]);
    const store = createBinaryStore(100);
    appendTracks(store, [track]);
    expect(store.length).toBe(2);
    expect(store.entityIds[0]).toBe('e1');
  });

  it('sortByTimestamp orders events', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'a', 5000, 0, 0);
    appendEvent(store, 'a', 1000, 1, 1);
    appendEvent(store, 'a', 3000, 2, 2);
    sortByTimestamp(store);
    expect(store.timestamps[0]).toBe(1000);
    expect(store.timestamps[1]).toBe(3000);
    expect(store.timestamps[2]).toBe(5000);
    expect(store.longitudes[0]).toBe(1); // matches the 1000ms event
  });

  it('getStoreBounds returns spatial-temporal extent', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'a', 1000, -122.5, 37.6);
    appendEvent(store, 'a', 5000, -122.3, 37.9);
    const bounds = getStoreBounds(store);
    expect(bounds.timeMin).toBe(1000);
    expect(bounds.timeMax).toBe(5000);
    expect(bounds.west).toBe(-122.5);
    expect(bounds.north).toBe(37.9);
  });

  it('queryTimeRange uses binary search', () => {
    const store = createBinaryStore(100);
    for (let i = 0; i < 20; i++) {
      appendEvent(store, 'a', i * 1000, 0, 0);
    }
    sortByTimestamp(store);
    const { start, end } = queryTimeRange(store, 5000, 10000);
    expect(start).toBe(5);
    expect(end).toBe(11); // events at 5000, 6000, 7000, 8000, 9000, 10000
  });

  it('querySpatioTemporal filters by bbox + time', () => {
    const store = createBinaryStore(100);
    appendEvent(store, 'a', 1000, -122.4, 37.7);
    appendEvent(store, 'a', 2000, -100.0, 40.0); // far away
    appendEvent(store, 'a', 3000, -122.5, 37.8);
    appendEvent(store, 'a', 9000, -122.4, 37.7); // outside time range
    sortByTimestamp(store);

    const indices = querySpatioTemporal(store, -123, 37, -122, 38, 0, 5000);
    expect(indices.length).toBe(2);
  });

  it('toBinaryAttributes creates deck.gl format', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'a', 1000, -122.4, 37.7, 50);
    appendEvent(store, 'a', 2000, -122.5, 37.8, 60);
    const attrs = toBinaryAttributes(store, 0, 2);
    expect(attrs.length).toBe(2);
    expect(attrs.attributes.getPosition.value.length).toBe(6); // 2 * 3
    expect(attrs.attributes.getPosition.value[0]).toBe(-122.4);
  });

  it('getEntityEventCounts tallies per entity', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'a', 1000, 0, 0);
    appendEvent(store, 'a', 2000, 0, 0);
    appendEvent(store, 'b', 3000, 0, 0);
    const counts = getEntityEventCounts(store);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });
});

describe('viewport-tiling', () => {
  it('queryViewport returns matching indices', () => {
    const store = createBinaryStore(100);
    // Add events in a grid
    for (let i = 0; i < 50; i++) {
      appendEvent(store, 'a', i * 1000, -122 + i * 0.01, 37 + i * 0.01);
    }
    sortByTimestamp(store);

    const result = queryViewport(store, {
      west: -122.1, south: 36.9, east: -121.9, north: 37.15,
      timeStart: 0, timeEnd: 20000,
    });
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.indices.length).toBeLessThan(50);
    expect(result.downsampled).toBe(false);
  });

  it('buildRenderData creates position arrays', () => {
    const store = createBinaryStore(10);
    appendEvent(store, 'a', 1000, -122.4, 37.7, 10);
    appendEvent(store, 'a', 2000, -122.5, 37.8, 20);
    const indices = new Uint32Array([0, 1]);
    const data = buildRenderData(store, indices);
    expect(data.length).toBe(2);
    expect(data.positions[0]).toBe(-122.4);
    expect(data.positions[1]).toBe(37.7);
  });

  it('viewportChanged detects significant changes', () => {
    const v1 = { west: -123, south: 37, east: -122, north: 38, timeStart: 0, timeEnd: 1000 };
    const v2 = { west: -123, south: 37, east: -122, north: 38, timeStart: 0, timeEnd: 1000 };
    expect(viewportChanged(v1, v2)).toBe(false);

    const v3 = { ...v1, west: -123.1 };
    expect(viewportChanged(v1, v3)).toBe(true);
  });

  it('computeTimeWindow narrows at high zoom', () => {
    const w1 = computeTimeWindow(0, 100000, 50000, null, 3);
    const w2 = computeTimeWindow(0, 100000, 50000, null, 12);
    expect(w1.timeEnd - w1.timeStart).toBeGreaterThan(w2.timeEnd - w2.timeStart);
  });
});
