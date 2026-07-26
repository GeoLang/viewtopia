import { describe, it, expect } from 'vitest';
import { parseTimeValue, timedImport, timedCzml } from '../../src/lib/importTime';
import { parseImport } from '../../src/lib/importGeoJson';

/**
 * Time detection and CZML shaping for imported files. The Cesium load itself
 * needs a live viewer, so it is covered by the panels e2e instead.
 */

const point = (coords: number[], properties: Record<string, unknown>) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: coords },
  properties,
});

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

describe('parseTimeValue', () => {
  it('reads ISO strings, date strings and epoch numbers', () => {
    expect(parseTimeValue('2024-03-01T00:00:00Z')).toBe(Date.parse('2024-03-01T00:00:00Z'));
    expect(parseTimeValue('2024-03-01')).toBe(Date.parse('2024-03-01'));
    expect(parseTimeValue(1709251200000)).toBe(1709251200000);
    expect(parseTimeValue('1709251200000')).toBe(1709251200000);
  });

  it('rejects what is not a time', () => {
    expect(parseTimeValue('')).toBeNull();
    expect(parseTimeValue('   ')).toBeNull();
    expect(parseTimeValue('not a date')).toBeNull();
    expect(parseTimeValue(null)).toBeNull();
    expect(parseTimeValue(NaN)).toBeNull();
  });
});

describe('timedImport', () => {
  it('is null when nothing carries a time', () => {
    expect(timedImport(collection([point([1, 2], { name: 'a' })]))).toBeNull();
  });

  it('reads a time property under any of its usual names', () => {
    for (const key of ['timestamp', 'time', 'datetime', 'date', 'TIMESTAMP']) {
      const timed = timedImport(collection([point([1, 2], { [key]: '2024-03-01T00:00:00Z' })]));
      expect(timed?.features).toHaveLength(1);
      expect(timed?.start).toBe(Date.parse('2024-03-01T00:00:00Z'));
    }
  });

  it('reads a CSV timestamp column, which import keeps as a string property', () => {
    const csv = [
      'name,lon,lat,timestamp',
      'a,7.42,43.73,2024-03-01T00:00:00Z',
      'b,7.43,43.74,2024-03-01T01:00:00Z',
    ].join('\n');
    const timed = timedImport(parseImport('pings.csv', csv));
    expect(timed?.features.map((f) => f.name)).toEqual(['a', 'b']);
    expect(timed?.start).toBe(Date.parse('2024-03-01T00:00:00Z'));
    expect(timed?.stop).toBe(Date.parse('2024-03-01T01:00:00Z'));
  });

  it('spans the earliest and latest feature, naming each one', () => {
    const timed = timedImport(
      collection([
        point([1, 2], { name: 'second', time: '2024-03-01T02:00:00Z' }),
        point([3, 4], { title: 'first', time: '2024-03-01T01:00:00Z' }),
        point([5, 6], { time: '2024-03-01T03:00:00Z' }),
      ]),
    );
    expect(timed?.start).toBe(Date.parse('2024-03-01T01:00:00Z'));
    expect(timed?.stop).toBe(Date.parse('2024-03-01T03:00:00Z'));
    expect(timed?.features.map((f) => f.name)).toEqual(['second', 'first', 'feature 3']);
    expect(timed?.features.every((f) => f.samples.length === 1)).toBe(true);
  });

  it('turns a GPX track with coordTimes into one moving feature', () => {
    const timed = timedImport(
      collection([
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [7.42, 43.73, 10],
              [7.43, 43.74, 20],
            ],
          },
          properties: {
            name: 'walk',
            coordTimes: ['2024-03-01T00:10:00Z', '2024-03-01T00:00:00Z'],
          },
        },
      ]),
    );
    expect(timed?.features).toHaveLength(1);
    // samples are sorted by time, not by vertex order
    expect(timed?.features[0].samples.map((s) => s.lon)).toEqual([7.43, 7.42]);
    expect(timed?.start).toBe(Date.parse('2024-03-01T00:00:00Z'));
    expect(timed?.stop).toBe(Date.parse('2024-03-01T00:10:00Z'));
  });

  it('ignores features whose time or geometry is missing', () => {
    const timed = timedImport(
      collection([
        point([1, 2], { time: 'nonsense' }),
        { type: 'Feature', geometry: null, properties: { time: '2024-03-01T00:00:00Z' } },
        point([3, 4], { time: '2024-03-01T00:00:00Z' }),
      ]),
    );
    expect(timed?.features).toHaveLength(1);
  });
});

describe('timedCzml', () => {
  it('carries a document clock over the whole window', () => {
    const timed = timedImport(
      collection([
        point([1, 2], { time: '2024-03-01T00:00:00Z' }),
        point([3, 4], { time: '2024-03-01T06:00:00Z' }),
      ]),
    )!;
    const [document] = timedCzml('pings.geojson', timed);
    expect(document).toMatchObject({
      id: 'document',
      name: 'pings.geojson',
      version: '1.0',
      clock: {
        interval: '2024-03-01T00:00:00.000Z/2024-03-01T06:00:00.000Z',
        currentTime: '2024-03-01T00:00:00.000Z',
      },
    });
    // playback speed stays the viewer's business
    expect(document.clock).not.toHaveProperty('multiplier');
  });

  it('keeps a single-sample feature visible for the rest of the window', () => {
    const timed = timedImport(
      collection([
        point([1, 2], { time: '2024-03-01T00:00:00Z' }),
        point([3, 4], { time: '2024-03-01T06:00:00Z' }),
      ]),
    )!;
    const [, first] = timedCzml('a.geojson', timed);
    expect(first.availability).toBe('2024-03-01T00:00:00.000Z/2024-03-01T06:00:00.000Z');
    expect(first.position).toEqual({ cartographicDegrees: [1, 2, 0] });
    // nothing moves, so no path
    expect(first).not.toHaveProperty('path');
  });

  it('gives a single instant an hour of room, so the clock can animate', () => {
    const timed = timedImport(collection([point([1, 2], { time: '2024-03-01T00:00:00Z' })]))!;
    expect(timed.start).toBe(timed.stop);
    const [document, feature] = timedCzml('one.geojson', timed);
    const clock = document.clock as { interval: string };
    expect(clock.interval).toBe('2024-03-01T00:00:00.000Z/2024-03-01T01:00:00.000Z');
    expect(feature.availability).toBe('2024-03-01T00:00:00.000Z/2024-03-01T01:00:00.000Z');
  });

  it('samples a moving feature as seconds from its epoch, with a trailing path', () => {
    const timed = timedImport(
      collection([
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [7.42, 43.73, 10],
              [7.43, 43.74, 20],
            ],
          },
          properties: { coordTimes: ['2024-03-01T00:00:00Z', '2024-03-01T00:01:00Z'] },
        },
      ]),
    )!;
    const [, feature] = timedCzml('walk.gpx', timed);
    expect(feature.availability).toBe('2024-03-01T00:00:00.000Z/2024-03-01T00:01:00.000Z');
    expect(feature.position).toEqual({
      epoch: '2024-03-01T00:00:00.000Z',
      cartographicDegrees: [0, 7.42, 43.73, 10, 60, 7.43, 43.74, 20],
    });
    expect(feature.path).toMatchObject({ trailTime: 60, leadTime: 0 });
  });

  it('emits one packet per timed feature, plus the document', () => {
    const timed = timedImport(
      collection([
        point([1, 2], { time: '2024-03-01T00:00:00Z' }),
        point([3, 4], { time: '2024-03-01T01:00:00Z' }),
        point([5, 6], {}),
      ]),
    )!;
    // two timed features and the document; the untimed one is left out
    expect(timedCzml('a.geojson', timed)).toHaveLength(3);
  });
});
