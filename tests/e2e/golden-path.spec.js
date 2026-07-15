import { test, expect } from '@playwright/test';

/**
 * Golden-path E2E against the live platform stack (docker-compose.platform.yml).
 *
 * This is the "is it shippable?" gate: it proves the deployed SPA can reach every
 * backend through the same-origin nginx proxy — the exact paths the app uses
 * (`/api/...`, `/tiles/...`, `/api/geocode/...`, `/api/route`). It does NOT use the
 * dev server, and is excluded from the default `npm run test:e2e` run.
 *
 * Run: docker compose -f docker-compose.platform.yml up -d && npm run test:e2e:platform
 *
 * The agent NL->map step is intentionally omitted (it spends real LLM credits);
 * see DESIGN_TODO.md Track 1.
 */

// Run all backend fetches from the SPA's browser origin, so we exercise the same
// same-origin proxy + CORS behaviour the real app does.
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

test.describe('Golden path — live platform stack', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('viewtopia-tour-done', '1'));
  });

  test('viewer SPA loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('ViewTopia');
  });

  test('ptolemy is reachable via /api/ proxy', async ({ page }) => {
    await page.goto('/');
    const r = await fetchFromApp(page, '/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.text.trim().toLowerCase()).toContain('ok');
  });

  test('tiletopia is reachable via /tiles/ proxy', async ({ page }) => {
    await page.goto('/');
    const r = await fetchFromApp(page, '/tiles/v1/health');
    expect(r.status).toBe(200);
    expect(r.json?.status).toBe('ok');
  });

  test('geocoding returns a hit via /api/geocode/ proxy', async ({ page }) => {
    await page.goto('/');
    // geokode serves the Monaco OSM extract (see docker-compose.platform.yml)
    const r = await fetchFromApp(page, '/api/geocode/forward?q=Boulevard%20Albert');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json?.results)).toBe(true);
    expect(r.json.results.length).toBeGreaterThanOrEqual(1);
    expect(r.json.results[0]).toHaveProperty('lat');
    expect(r.json.results[0]).toHaveProperty('lon');
  });

  test('geocoding matches by street name (not just house number)', async ({ page }) => {
    await page.goto('/');
    // geokode indexes street/city variants — querying a street name (the
    // common case) must return hits. "Rue Grimaldi" exists in the Monaco extract.
    const r = await fetchFromApp(page, '/api/geocode/forward?q=Rue%20Grimaldi');
    expect(r.status).toBe(200);
    expect(r.json?.results?.length).toBeGreaterThanOrEqual(1);
  });

  test('routing returns a route via /api/route proxy', async ({ page }) => {
    await page.goto('/');
    // Two points within the Monaco graph built during Track 1.
    const r = await fetchFromApp(
      page,
      '/api/route?from=43.7384,7.4246&to=43.7320,7.4197',
    );
    expect(r.status).toBe(200);
    expect(r.json?.distance_m).toBeGreaterThan(0);
    expect(r.json?.duration_s).toBeGreaterThan(0);
    expect(Array.isArray(r.json?.geometry)).toBe(true);
    expect(r.json.geometry.length).toBeGreaterThan(1);
  });
});
