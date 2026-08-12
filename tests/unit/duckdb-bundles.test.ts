import { describe, it, expect } from 'vitest';
import { BUNDLES } from '../../src/duckdb/worker';

describe('duckdb bundles', () => {
  it('serves every wasm and worker from the app origin', () => {
    const assets = Object.values(BUNDLES).flatMap((bundle) => Object.values(bundle));
    expect(assets).toHaveLength(4);
    for (const asset of assets) {
      expect(asset).not.toMatch(/^https?:\/\//);
    }
  });
});
