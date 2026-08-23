import { test, expect } from './console-guard';

/**
 * First-load defaults. A clean profile boots the MapLibre renderer on the dark
 * vector basemap, with Cesium one renderer switch away. The panel suites seed
 * a Cesium renderer instead (see panel-helpers.js), so this is the only spec
 * exercising the real boot path.
 *
 * Run: npm run test:e2e:react
 */

test('first visit offers the demo dataset and hands over to the tour', async ({ page }) => {
  await page.goto('/');
  const overlay = page.getByTestId('first-run-overlay');
  // the first test pays vite's cold compile, same as the boot waits below
  await expect(overlay).toBeVisible({ timeout: 60000 });
  await overlay.getByRole('button', { name: /demo data/i }).click();
  await expect(overlay).not.toBeVisible();

  // the tour starts on its first step
  await expect(page.getByText('Welcome to ViewTopia').first()).toBeVisible();

  // the demo layer joined the agent layers
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByText('San Francisco landmarks').first()).toBeVisible();
});

test('dismissing the first-run overlay persists across reloads', async ({ page }) => {
  await page.goto('/');
  const overlay = page.getByTestId('first-run-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Got it' }).click();
  await expect(overlay).not.toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Layers' })).toBeVisible();
  await expect(page.getByTestId('first-run-overlay')).not.toBeVisible();
});

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
