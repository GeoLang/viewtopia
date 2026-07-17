import { test, expect } from '@playwright/test';

/**
 * Terrain-analysis endpoints against the live platform stack. Like the panels,
 * every call runs from the SPA browser origin through the same-origin /tiles/
 * proxy (nginx rewrites /tiles/(.*) -> tiletopia /api/$1).
 *
 *   docker compose -f docker-compose.platform.yml up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/analysis-smoke.spec.js
 *
 * tiletopia serves /api/v1/analysis/{viewshed,flood,terrain,solar}; elevation falls
 * back to a synthetic surface, so no tileset needs to be ingested first.
 */

const BBOX = [7.4, 43.72, 7.45, 43.75]; // small area near Monaco

async function post(page, path, body) {
  return page.evaluate(
    async ({ p, b }) => {
      const res = await fetch(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      const contentType = res.headers.get('content-type') || '';
      let json = null;
      if (contentType.includes('json')) {
        json = await res.json().catch(() => null);
      }
      return { status: res.status, ok: res.ok, contentType, json };
    },
    { p: path, b: body },
  );
}

test.describe('Terrain analysis — live platform stack', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('viewtopia-tour-done', '1'));
    await page.goto('/');
  });

  test('viewshed returns a visible-area polygon', async ({ page }) => {
    const r = await post(page, '/tiles/v1/analysis/viewshed', {
      observer: [7.42, 43.73],
      height_m: 2,
      radius_m: 1000,
    });
    expect(r.status).toBe(200);
    expect(r.json.type).toBe('FeatureCollection');
    const geom = r.json.features[0].geometry;
    expect(geom.type).toBe('Polygon');
    expect(geom.coordinates[0].length).toBeGreaterThan(8);
    expect(r.json.features[0].properties.visible_area_m2).toBeGreaterThan(0);
  });

  test('flood extent grows with water level', async ({ page }) => {
    const low = await post(page, '/tiles/v1/analysis/flood', { level_m: 30, bbox: BBOX });
    const high = await post(page, '/tiles/v1/analysis/flood', { level_m: 80, bbox: BBOX });
    expect(low.status).toBe(200);
    expect(high.status).toBe(200);
    const cellsLow = low.json.features.length ? low.json.features[0].properties.flooded_cells : 0;
    const cellsHigh = high.json.features.length ? high.json.features[0].properties.flooded_cells : 0;
    expect(cellsHigh).toBeGreaterThanOrEqual(cellsLow);
  });

  test('hillshade returns a PNG', async ({ page }) => {
    const r = await post(page, '/tiles/v1/analysis/terrain', { op: 'hillshade', bbox: BBOX });
    expect(r.status).toBe(200);
    expect(r.contentType).toContain('image/png');
  });

  test('contours return ordered line features', async ({ page }) => {
    const r = await post(page, '/tiles/v1/analysis/terrain', { op: 'contours', bbox: BBOX });
    expect(r.status).toBe(200);
    expect(r.json.type).toBe('FeatureCollection');
    expect(Array.isArray(r.json.features)).toBe(true);
    if (r.json.features.length) {
      expect(r.json.features[0].geometry.type).toBe('LineString');
      expect(r.json.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('solar returns an irradiance PNG', async ({ page }) => {
    const r = await post(page, '/tiles/v1/analysis/solar', { bbox: BBOX, date: '2026-06-21' });
    expect(r.status).toBe(200);
    expect(r.contentType).toContain('image/png');
  });
});
