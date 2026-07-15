import { test, expect } from '@playwright/test';
import * as turf from '@turf/turf';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Real-estate vertical E2E against the live platform stack (docker-compose.platform.yml).
 * Mirrors golden-path.spec.js: all backend calls run from the SPA's browser origin
 * through the same-origin /api/ proxy, exactly like the real panels do.
 *
 *   docker compose -f docker-compose.platform.yml up -d
 *   node scripts/seed-parcels.mjs   # (also run automatically in beforeAll)
 *   npx playwright test -c playwright.platform.config.js tests/e2e/realestate-smoke.spec.js
 *
 * Ptolemy is reached directly (localhost:3000) only for seeding; every assertion
 * about the app goes through the browser proxy.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

async function fetchFromApp(page, path, init) {
  return page.evaluate(
    async ({ p, i }) => {
      const res = await fetch(p, i);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: res.status, ok: res.ok, text, json };
    },
    { p: path, i: init },
  );
}

async function discoverBranch(page, datasetName) {
  const ds = await fetchFromApp(page, '/api/v1/datasets');
  const dataset = ds.json.find((d) => d.name === datasetName);
  if (!dataset) return null;
  const br = await fetchFromApp(page, `/api/v1/datasets/${dataset.id}/branches`);
  const branch = br.json.find((b) => b.name === 'main') ?? br.json[0];
  return branch?.id ?? null;
}

// WKB polygon/multipolygon encoder (little-endian, 2D) — mirrors src/lib/wkb.ts,
// kept inline so the spec is self-contained like golden-path.spec.js.
function u32(o, v) {
  o.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255);
}
function dbl(o, v) {
  const b = new ArrayBuffer(8);
  new DataView(b).setFloat64(0, v, true);
  new Uint8Array(b).forEach((x) => o.push(x));
}
function rings(o, rs) {
  u32(o, rs.length);
  for (const r of rs) {
    u32(o, r.length);
    for (const [x, y] of r) {
      dbl(o, x);
      dbl(o, y);
    }
  }
}
function toWkbHex(g) {
  const o = [];
  if (g.type === 'Polygon') {
    o.push(1);
    u32(o, 3);
    rings(o, g.coordinates);
  } else if (g.type === 'MultiPolygon') {
    o.push(1);
    u32(o, 6);
    u32(o, g.coordinates.length);
    for (const poly of g.coordinates) {
      o.push(1);
      u32(o, 3);
      rings(o, poly);
    }
  } else {
    throw new Error(`unsupported geometry ${g.type}`);
  }
  return o.map((b) => b.toString(16).padStart(2, '0')).join('');
}

test.describe('Real-estate vertical — live platform stack', () => {
  test.beforeAll(() => {
    execFileSync('node', ['scripts/seed-parcels.mjs'], {
      cwd: REPO,
      env: { ...process.env, PTOLEMY_URL: process.env.PTOLEMY_URL ?? 'http://localhost:3000' },
      stdio: 'inherit',
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('viewtopia-tour-done', '1'));
    await page.goto('/');
  });

  test('demo datasets are discoverable', async ({ page }) => {
    const parcels = await discoverBranch(page, 'demo_parcels');
    const sales = await discoverBranch(page, 'demo_sales');
    expect(parcels).toBeTruthy();
    expect(sales).toBeTruthy();
  });

  test('parcel search by APN returns the parcel', async ({ page }) => {
    const branch = await discoverBranch(page, 'demo_parcels');
    const r = await fetchFromApp(
      page,
      `/api/v1/parcels/search?branch_id=${branch}&type=apn&q=06-1001&limit=1`,
    );
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
    expect(r.json.length).toBe(1);
    expect(r.json[0].apn).toBe('06-1001');
    expect(r.json[0].geometry_wkb_hex).toMatch(/^01/);
  });

  test('parcel search by owner matches', async ({ page }) => {
    const branch = await discoverBranch(page, 'demo_parcels');
    const r = await fetchFromApp(
      page,
      `/api/v1/parcels/search?branch_id=${branch}&type=owner&q=Grimaldi&limit=50`,
    );
    expect(r.status).toBe(200);
    expect(r.json.length).toBeGreaterThanOrEqual(1);
  });

  test('comps search returns sales with a price summary', async ({ page }) => {
    const branch = await discoverBranch(page, 'demo_sales');
    const r = await fetchFromApp(
      page,
      `/api/v1/comps/search?branch_id=${branch}&lng=7.4207&lat=43.7343&radius_m=3000&max_days=400`,
    );
    expect(r.status).toBe(200);
    expect(r.json.results.length).toBeGreaterThanOrEqual(1);
    expect(r.json.summary.avg_price).toBeGreaterThan(0);
    // results are distance-sorted
    const d = r.json.results.map((c) => c.distance_m);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });

  test('merge round-trip: union two parcels and commit, feature count drops by one', async ({ page }) => {
    const branch = await discoverBranch(page, 'demo_parcels');

    // work on two throwaway parcels this test creates, so it never disturbs the
    // seeded demo parcels the search tests assert on and stays re-runnable.
    const tag = randomUUID().slice(0, 8);
    const square = (x0, y0) => ({
      type: 'Polygon',
      coordinates: [
        [
          [x0, y0],
          [x0 + 0.0005, y0],
          [x0 + 0.0005, y0 + 0.0005],
          [x0, y0 + 0.0005],
          [x0, y0],
        ],
      ],
    });
    const a = { id: randomUUID(), apn: `TMP-${tag}-A`, geom: square(7.45, 43.76) };
    const b = { id: randomUUID(), apn: `TMP-${tag}-B`, geom: square(7.4505, 43.76) };

    const seedTwo = await fetchFromApp(page, `/api/v1/branches/${branch}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'seed merge inputs',
        author: 'e2e',
        operations: [a, b].map((p) => ({
          type: 'insert',
          feature_id: p.id,
          geometry_wkb_hex: toWkbHex(p.geom),
          properties: { apn: p.apn },
        })),
      }),
    });
    expect(seedTwo.status === 200 || seedTwo.status === 201).toBe(true);

    const before = await fetchFromApp(page, `/api/v1/branches/${branch}/features`);
    const countBefore = before.json.features.length;

    // union with turf exactly like the panel does, then commit the merge.
    const merged = turf.union(
      turf.featureCollection([turf.feature(a.geom), turf.feature(b.geom)]),
    );
    expect(merged).toBeTruthy();

    const mergedApn = `TMP-${tag}-M`;
    const ops = [
      {
        type: 'insert',
        feature_id: randomUUID(),
        geometry_wkb_hex: toWkbHex(merged.geometry),
        properties: { apn: mergedApn, merged_from: [a.apn, b.apn] },
      },
      { type: 'delete', feature_id: a.id },
      { type: 'delete', feature_id: b.id },
    ];
    const commit = await fetchFromApp(page, `/api/v1/branches/${branch}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'merge e2e', author: 'e2e', operations: ops }),
    });
    expect(commit.status === 200 || commit.status === 201).toBe(true);

    const after = await fetchFromApp(page, `/api/v1/branches/${branch}/features`);
    expect(after.json.features.length).toBe(countBefore - 1);

    // the merged parcel is queryable by its new APN
    const found = await fetchFromApp(
      page,
      `/api/v1/parcels/search?branch_id=${branch}&type=apn&q=${mergedApn}&limit=1`,
    );
    expect(found.json.length).toBeGreaterThanOrEqual(1);
  });
});
