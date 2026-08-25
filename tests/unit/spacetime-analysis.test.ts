import { describe, it, expect } from 'vitest';
import { detectCoTravel } from '../../src/features/spacetime/analysis/co-travel';
import { runAnalysis, PREDICTION_HORIZON_MS } from '../../src/features/spacetime/analysis/run';
import type { AnalysisInput } from '../../src/features/spacetime/analysis/run';
import type { Link, SpaceTimeEvent, Track } from '../../src/features/spacetime/types';

const START = Date.parse('2024-01-15T08:00:00Z');
const TEN_MINUTES = 600_000;

function event(entityId: string, step: number, lng: number, lat: number): SpaceTimeEvent {
  return {
    id: `${entityId}-${step}`,
    entityId,
    timestamp: START + step * TEN_MINUTES,
    lng,
    lat,
  };
}

/** Alice and Bob walk the same line ~9 m apart for 50 minutes. */
function alice(): Track {
  return {
    id: 'track-alice',
    entityId: 'alice',
    events: [0, 1, 2, 3, 4, 5].map((s) => event('alice', s, -122.4 + s * 0.0001, 37.77)),
  };
}

function bob(): Track {
  return {
    id: 'track-bob',
    entityId: 'bob',
    events: [0, 1, 2, 3, 4, 5].map((s) => event('bob', s, -122.4 + s * 0.0001 + 0.0001, 37.77)),
  };
}

/** Carol sits at one spot, returning four times with gaps past the dwell threshold. */
function carol(): Track {
  return {
    id: 'track-carol',
    entityId: 'carol',
    events: [0, 1, 2, 3].map((s) => event('carol', s, -122.5, 37.8)),
  };
}

/** Dave's middle fix is null island. */
function dave(): Track {
  return {
    id: 'track-dave',
    entityId: 'dave',
    events: [
      event('dave', 0, -122.42, 37.75),
      event('dave', 1, 0, 0),
      event('dave', 2, -122.42, 37.75),
    ],
  };
}

const LINKS: Link[] = [
  { id: 'l1', sourceId: 'alice', targetId: 'bob', kind: 'colocation' },
  { id: 'l2', sourceId: 'bob', targetId: 'carol', kind: 'communication' },
];

function input(overrides: Partial<AnalysisInput> = {}): AnalysisInput {
  const tracks = overrides.tracks ?? [alice(), bob(), carol(), dave()];
  return {
    tracks,
    links: overrides.links ?? LINKS,
    entities: overrides.entities ?? [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
      { id: 'carol', name: 'Carol' },
      { id: 'dave', name: 'Dave' },
    ],
    timeRange: overrides.timeRange ?? { min: START, max: START + 5 * TEN_MINUTES },
  };
}

describe('detectCoTravel', () => {
  it('chains a pair of meetings into one sustained run', () => {
    const runs = detectCoTravel([alice(), bob()]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ entityA: 'alice', entityB: 'bob', meetingCount: 6 });
    expect(runs[0].durationMs).toBe(5 * TEN_MINUTES);
    expect(runs[0].meanDistanceM).toBeLessThan(100);
  });

  it('rejects a run shorter than the minimum duration', () => {
    expect(detectCoTravel([alice(), bob()], { minDurationMs: 2 * 60 * 60_000 })).toEqual([]);
  });

  it('splits one pair into separate runs across a long gap', () => {
    const gapped = (entityId: string, offset: number): Track => ({
      id: `track-${entityId}`,
      entityId,
      events: [0, 1, 2, 20, 21, 22].map((s) => ({
        id: `${entityId}-${s}`,
        entityId,
        timestamp: START + s * TEN_MINUTES,
        lng: -122.4 + offset,
        lat: 37.77,
      })),
    });

    const runs = detectCoTravel([gapped('a', 0), gapped('b', 0.0001)], {
      minDurationMs: TEN_MINUTES,
    });
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.durationMs === 2 * TEN_MINUTES)).toBe(true);
  });

  it('finds nothing between entities that stay apart', () => {
    expect(detectCoTravel([alice(), carol()])).toEqual([]);
  });

  it('sorts the longest run first', () => {
    const runs = detectCoTravel([alice(), bob(), carol(), dave()]);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i - 1].durationMs).toBeGreaterThanOrEqual(runs[i].durationMs);
    }
  });
});

describe('runAnalysis', () => {
  it('stamps every row with a stable id', () => {
    const result = runAnalysis('colocation', input());
    const ids = result.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('colocation-0');
  });

  it('colocation marks each meeting and names both entities', () => {
    const result = runAnalysis('colocation', input());
    expect(result.kind).toBe('colocation');
    expect(result.points.length).toBe(6);
    expect(result.title).toBe('6 meetings');
    expect(result.rows[0].label).toBe('Alice + Bob');
    expect(result.paths).toEqual([]);
    // meeting markers sit between the two tracks
    expect(result.points[0].lat).toBeCloseTo(37.77);
    expect(result.points[0].ringRadiusM).toBeNull();
  });

  it('co-travel draws a paired segment for each entity in the run', () => {
    const result = runAnalysis('cotravel', input());
    expect(result.title).toBe('1 co-travel runs');
    expect(result.paths).toHaveLength(2);
    expect(result.paths.every((p) => p.label === 'Alice with Bob')).toBe(true);
    expect(result.paths[0].points).toHaveLength(6);
    expect(result.rows[0].detail).toContain('50 min together');
  });

  it('pattern-of-life rings the dwell locations and lists the busiest hour', () => {
    const result = runAnalysis('pattern', input());
    const rings = result.points.filter((p) => p.ringRadiusM !== null);
    expect(rings.length).toBeGreaterThan(0);
    // Carol is the one who returns to a single spot
    expect(rings.some((r) => r.label.startsWith('Carol'))).toBe(true);
    expect(rings[0].ringRadiusM).toBeGreaterThan(0);
    expect(result.rows.map((r) => r.label)).toContain('Carol');
    expect(result.rows.some((r) => r.detail.includes('busiest around 8:00 UTC'))).toBe(true);
  });

  it('network metrics rank entities and draw nothing', () => {
    const result = runAnalysis('network', input());
    expect(result.points).toEqual([]);
    expect(result.paths).toEqual([]);
    expect(result.title).toBe('4 entities over 2 links');
    // bob is linked to both alice and carol, so he outranks them
    expect(result.rows[0].label).toBe('Bob');
    expect(result.rows[0].detail).toMatch(/degree 0\.6[67]/);
  });

  it('clustering colors every track by its cluster', () => {
    const result = runAnalysis('clustering', input());
    expect(result.paths).toHaveLength(4);
    expect(result.rows.length).toBeGreaterThan(0);
    const named = result.rows.flatMap((r) => r.detail.split(', '));
    expect(named.sort()).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
    // entities in one cluster share a color
    const colors = new Set(result.paths.map((p) => p.color.join(',')));
    expect(colors.size).toBeLessThanOrEqual(3);
  });

  it('prediction gives every entity a ghost marker and a path to it', () => {
    const result = runAnalysis('prediction', input());
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.paths).toHaveLength(result.points.length);
    expect(result.title).toContain('60 min ahead');

    const ghost = result.points[0];
    expect(ghost.timestamp).toBe(input().timeRange.max + PREDICTION_HORIZON_MS);
    // the path runs from the last real fix to the ghost
    const path = result.paths[0];
    expect(path.points).toHaveLength(2);
    expect(path.points[1].lng).toBe(ghost.lng);
    expect(path.points[1].lat).toBe(ghost.lat);
  });

  it('quality highlights the offending event at its own coordinates', () => {
    const result = runAnalysis('quality', input());
    expect(result.title).toContain('zero coord');
    const nullIsland = result.points.find((p) => p.lng === 0 && p.lat === 0);
    expect(nullIsland).toBeDefined();
    expect(nullIsland?.label).toContain('Dave');
    expect(result.rows.some((r) => r.label.includes('zero coord'))).toBe(true);
  });

  it('reports an empty run rather than throwing on no data', () => {
    const bare = input({ tracks: [], links: [], entities: [] });
    for (const kind of ['colocation', 'cotravel', 'pattern', 'network', 'clustering', 'prediction', 'quality'] as const) {
      const result = runAnalysis(kind, bare);
      expect(result.kind).toBe(kind);
      expect(result.points).toEqual([]);
      expect(result.paths).toEqual([]);
      expect(result.title.length).toBeGreaterThan(0);
    }
  });
});
