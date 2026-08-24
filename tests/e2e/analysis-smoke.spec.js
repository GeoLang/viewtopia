import { test, expect } from './console-guard';
import { platformAuthHeaders } from '../../scripts/platform-token.mjs';

/**
 * Terrain-analysis endpoints against the live platform stack. Like the panels,
 * every call runs from the SPA browser origin through the same-origin /tiles/
 * proxy (nginx rewrites /tiles/(.*) -> tiletopia /api/$1).
 *
 *   docker compose -f docker-compose.platform.yml up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/analysis-smoke.spec.js
 *
 * tiletopia serves /api/v1/analysis/{viewshed,flood,terrain,solar} from the
 * DEM the stack stages (staged tiles, then the SRTM cache); a box with no
 * coverage is refused rather than answered from an invented surface.
 */

const BBOX = [7.4, 43.72, 7.45, 43.75]; // small area near Monaco
// tiletopia only exempts health, login and GET tile reads from auth, so the
// analysis POSTs need a token when the stack enforces it
const AUTH = platformAuthHeaders({ role: 'editor', sub: 'analysis-e2e' });

async function post(page, path, body) {
  return page.evaluate(
    async ({ p, b, h }) => {
      const res = await fetch(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify(b),
      });
      const contentType = res.headers.get('content-type') || '';
      let json = null;
      if (contentType.includes('json')) {
        json = await res.json().catch(() => null);
      }
      return { status: res.status, ok: res.ok, contentType, json };
    },
    { p: path, b: body, h: AUTH },
  );
}

test.describe('Terrain analysis — live platform stack', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('viewtopia-tour-done', '1'));
    await page.goto('/');
  });

  test('viewshed returns the visible cells as a multipolygon', async ({ page }) => {
    const r = await post(page, '/tiles/v1/analysis/viewshed', {
      observer: [7.42, 43.73],
      height_m: 2,
      radius_m: 1000,
    });
    expect(r.status).toBe(200);
    expect(r.json.type).toBe('FeatureCollection');
    // ray-cast viewshed: one square per visible cell, so a MultiPolygon
    expect(r.json.features.length).toBe(1);
    const geom = r.json.features[0].geometry;
    expect(geom.type).toBe('MultiPolygon');
    expect(geom.coordinates.length).toBeGreaterThanOrEqual(1);
    expect(r.json.features[0].properties.visible_cells).toBeGreaterThan(0);
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
