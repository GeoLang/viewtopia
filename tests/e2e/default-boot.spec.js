import { test, expect } from './console-guard';

/**
 * First-load defaults. A clean profile boots the MapLibre renderer on the dark
 * vector basemap, with Cesium one renderer switch away. The panel suites seed
 * a Cesium renderer instead (see panel-helpers.js), so this is the only spec
 * exercising the real boot path.
 *
 * Run: npm run test:e2e:react
 */

test('a clean profile boots MapLibre on the dark vector basemap', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60000 });
  await expect(page.locator('#maplibre-container canvas').first()).toBeVisible();

  // no Cesium viewer booted alongside it
  expect(await page.evaluate(() => window.__viewtopiaViewer ?? null)).toBeNull();

  // the map is on the OpenFreeMap dark style, not a raster fallback (the dark
  // flavor ships a raster hillshade source too, so look for any vector source)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const style = window.__viewtopiaMap.isStyleLoaded()
            ? window.__viewtopiaMap.getStyle()
            : null;
          return style ? Object.values(style.sources).some((s) => s.type === 'vector') : null;
        }),
      { timeout: 30000 },
    )
    .toBe(true);

  // the corner control reflects the defaults
  await page.getByRole('button', { name: 'Basemap & renderer' }).click();
  await expect(page.locator('input[aria-label="Renderer"]')).toHaveValue('MapLibre');
  await expect(page.locator('input[aria-label="Basemap"]')).toHaveValue('Dark');
});
