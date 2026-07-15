import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface Field {
  name: string;
  type: string;
}

// hoisted so both the state and the render spy exist before the vi.mock
// factories (which are hoisted above the imports) run.
const { mockDb, mockRenderGeoJson } = vi.hoisted(() => ({
  mockDb: { fields: [], rows: [], geomRows: [], throwError: false } as {
    fields: Field[];
    rows: Record<string, unknown>[];
    geomRows: Record<string, unknown>[];
    throwError: boolean;
  },
  mockRenderGeoJson: vi.fn(async () => {}),
}));

function makeTable(fields: Field[], rows: Record<string, unknown>[]) {
  return {
    schema: { fields: fields.map((f) => ({ name: f.name, type: { toString: () => f.type } })) },
    toArray: () => rows.map((r) => ({ toJSON: () => r })),
  };
}

vi.mock('../../src/duckdb/worker', () => ({
  getConnection: async () => ({
    query: async (sql: string) => {
      if (mockDb.throwError) throw new Error('Parser Error: syntax error at BADSQL');
      if (/limit 0/i.test(sql)) return makeTable(mockDb.fields, []);
      if (sql.includes('__geom__')) return makeTable(mockDb.fields, mockDb.geomRows);
      return makeTable(mockDb.fields, mockDb.rows);
    },
  }),
  getDb: async () => ({}),
  close: async () => {},
}));

// stub the cesium render boundary so we can assert what geometry was detected
vi.mock('../../src/viewer/renderGeoJson', () => ({ renderGeoJson: mockRenderGeoJson }));

import { runSqlQuery, type SqlResultSummary } from '../../src/duckdb/sqlCommand';
import type { FeatureCollection } from 'geojson';

function captureEvent(name: string): { detail: unknown | null } {
  const box: { detail: unknown | null } = { detail: null };
  window.addEventListener(name, (e) => {
    box.detail = (e as CustomEvent).detail;
  });
  return box;
}

describe('sql_query command', () => {
  beforeEach(() => {
    mockDb.fields = [];
    mockDb.rows = [];
    mockDb.geomRows = [];
    mockDb.throwError = false;
    mockRenderGeoJson.mockClear();
    delete window.__viewtopiaSqlResults;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects a WKT geometry column and renders it', async () => {
    mockDb.fields = [
      { name: 'name', type: 'VARCHAR' },
      { name: 'geom', type: 'VARCHAR' },
    ];
    mockDb.rows = [{ name: 'A', geom: 'POINT(1 2)' }];
    mockDb.geomRows = [{ name: 'A', __geom__: '{"type":"Point","coordinates":[1,2]}' }];

    await runSqlQuery({ sql: 'SELECT name, geom FROM places' });

    expect(mockRenderGeoJson).toHaveBeenCalledTimes(1);
    const fc = mockRenderGeoJson.mock.calls[0][0] as unknown as FeatureCollection;
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(fc.features[0].properties).toMatchObject({ name: 'A' });
  });

  it('detects a lon/lat column pair and builds point features', async () => {
    mockDb.fields = [
      { name: 'city', type: 'VARCHAR' },
      { name: 'lon', type: 'DOUBLE' },
      { name: 'lat', type: 'DOUBLE' },
    ];
    mockDb.rows = [{ city: 'X', lon: 5, lat: 6 }];
    mockDb.geomRows = [{ city: 'X', lon: 5, lat: 6, __geom__: '{"type":"Point","coordinates":[5,6]}' }];

    await runSqlQuery({ sql: 'SELECT city, lon, lat FROM cities' });

    expect(mockRenderGeoJson).toHaveBeenCalledTimes(1);
    const fc = mockRenderGeoJson.mock.calls[0][0] as unknown as FeatureCollection;
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [5, 6] });
    expect(fc.features[0].properties).toMatchObject({ city: 'X' });
  });

  it('stashes a result summary and caps the ring buffer at 20', async () => {
    mockDb.fields = [{ name: 'n', type: 'INTEGER' }];
    mockDb.rows = Array.from({ length: 8 }, (_, i) => ({ n: i }));

    const result = captureEvent('viewtopia:sql_result');

    // no geometry columns, so map render is skipped but the summary still fires
    for (let i = 0; i < 25; i++) {
      await runSqlQuery({ sql: `SELECT n FROM t WHERE n > ${i}`, show_on_map: false });
    }

    const buf = window.__viewtopiaSqlResults as SqlResultSummary[];
    expect(buf).toHaveLength(20);
    expect(buf[buf.length - 1].sql).toBe('SELECT n FROM t WHERE n > 24');
    expect(mockRenderGeoJson).not.toHaveBeenCalled();

    const summary = result.detail as SqlResultSummary;
    expect(summary.rowCount).toBe(8);
    expect(summary.columns).toEqual(['n']);
    expect(summary.sample).toHaveLength(5);
  });

  it('dispatches sql_error on a failing query', async () => {
    mockDb.throwError = true;
    const error = captureEvent('viewtopia:sql_error');
    const ok = captureEvent('viewtopia:sql_result');

    await runSqlQuery({ sql: 'SELECT BADSQL' });

    const detail = error.detail as { sql: string; error: string };
    expect(detail.sql).toBe('SELECT BADSQL');
    expect(detail.error).toContain('syntax error');
    expect(ok.detail).toBeNull();
    expect(window.__viewtopiaSqlResults).toBeUndefined();
  });
});
