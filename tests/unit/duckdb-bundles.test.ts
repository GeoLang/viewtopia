import { describe, it, expect, vi, afterEach } from 'vitest';
import { BUNDLES, EXTENSION_REPOSITORY, loadSpatial } from '../../src/duckdb/worker';

const UPSTREAM = 'https://extensions.duckdb.org';

function recordingConnection(failUntilAttempt = 0) {
  const queries: string[] = [];
  let installs = 0;
  return {
    queries,
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('INSTALL') && ++installs <= failUntilAttempt) {
        throw new Error('Extension is not available');
      }
      return undefined;
    },
  };
}

describe('duckdb bundles', () => {
  it('serves every wasm and worker from the app origin', () => {
    const assets = Object.values(BUNDLES).flatMap((bundle) => Object.values(bundle));
    expect(assets).toHaveLength(4);
    for (const asset of assets) {
      expect(asset).not.toMatch(/^https?:\/\//);
    }
  });
});

describe('spatial extension', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs from the app origin without touching duckdb.org', async () => {
    const conn = recordingConnection();
    await loadSpatial(conn);
    expect(conn.queries[0]).toContain(`${location.origin}${EXTENSION_REPOSITORY}`);
    expect(conn.queries[1]).toContain('INSTALL spatial');
    expect(conn.queries.join('\n')).not.toContain(UPSTREAM);
  });

  it('falls back to duckdb.org when the vendored copy is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const conn = recordingConnection(1);
    await loadSpatial(conn);
    expect(conn.queries[2]).toContain(UPSTREAM);
    expect(conn.queries[3]).toContain('INSTALL spatial');
  });

  it('resolves when no repository has the extension', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const conn = recordingConnection(2);
    await expect(loadSpatial(conn)).resolves.toBeUndefined();
  });
});
