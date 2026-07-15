import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the six tool panels wired to real functionality:
 * Shadows, Lighting, Global Terrain (Cesium scene) + Heatmap, Spatial Stats
 * (deck.gl aggregation) + Cross Section (elevation profile).
 *
 * Served standalone on :5175 (see playwright.react.config.js). deck.gl gets a
 * real WebGL canvas headless; the Cesium viewer may be absent headless, so the
 * Cesium panels assert the live scene property when a viewer exists and the
 * no-viewer status otherwise (both are real outputs of the panel's apply path).
 *
 * Run: npm run test:e2e:react
 */

const REACT_URL = '/';

const SAMPLE_POINTS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: { value: 10 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.12, 51.51] }, properties: { value: 20 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.09, 51.49] }, properties: { value: 30 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.11, 51.505] }, properties: { value: 5 } },
  ],
});

/** Read the live Cesium viewer handle exposed by the renderer registry, if any. */
async function readViewer(page, expr) {
  return page.evaluate((e) => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed?.()) return { present: false };
    // eslint-disable-next-line no-new-func
    return { present: true, value: new Function('v', `return (${e})`)(v) };
  }, expr);
}

test.describe('tool panels', () => {
  test('shadows: enabling drives the live scene or reports no viewer', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('🌑 Shadows').click();
    await expect(page.getByText('Shadow Analysis')).toBeVisible();

    await page.getByText('Enable Shadows').click();
    await expect(page.getByLabel('Enable Shadows')).toBeChecked();

    const v = await readViewer(page, 'v.shadows');
    if (v.present) {
      expect(v.value).toBe(true);
      await expect(page.getByTestId('shadows-status')).toContainText('shadows on');
    } else {
      await expect(page.getByTestId('shadows-status')).toHaveText('No active viewer');
    }
  });

  test('lighting: enabling toggles globe lighting on the live scene', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByText('☀ Lighting').click();
    await expect(page.getByText('Day Lighting')).toBeVisible();

    await page.getByText('Enable Sun Simulation').click();
    await expect(page.getByLabel('Enable Sun Simulation')).toBeChecked();

    const v = await readViewer(page, 'v.scene.globe.enableLighting');
    if (v.present) {
      expect(v.value).toBe(true);
      await expect(page.getByTestId('lighting-status')).toContainText('lighting on');
    } else {
      await expect(page.getByTestId('lighting-status')).toHaveText('No active viewer');
    }
  });

  test('global terrain: enable runs the provider path and reset returns ellipsoid', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByText('⛰ Terrain').click();
    await expect(page.getByText('Global Terrain')).toBeVisible();

    await page.getByRole('button', { name: 'Enable Terrain' }).click();
    // Either the provider resolves/fails (Ion token dependent) or there's no viewer.
    await expect(page.getByTestId('terrain-status')).toHaveText(
      /enabled|Terrain failed|No active viewer/,
      { timeout: 15000 },
    );

    await page.getByRole('button', { name: 'Reset to Ellipsoid' }).click();
    const v = await readViewer(page, "v.terrainProvider.constructor.name");
    if (v.present) {
      expect(v.value).toBe('EllipsoidTerrainProvider');
      await expect(page.getByTestId('terrain-status')).toHaveText('Ellipsoid (default)');
    } else {
      await expect(page.getByTestId('terrain-status')).toHaveText('No active viewer');
    }
  });

  test('heatmap: adds a deck.gl layer from pasted GeoJSON', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('🔥 Heatmap').click();
    await expect(page.getByText('Heatmap Layer')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Real effects: status reflects the parsed point count and the deck renderer mounts.
    await expect(page.getByTestId('heatmap-status')).toHaveText('Heatmap added: 4 points');
    await expect(page.locator('#deckgl-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('spatial stats: aggregates pasted points into a deck.gl grid', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('📊 Statistics').click();
    await expect(page.getByText('Spatial Statistics')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    await expect(page.getByTestId('spatialstats-result')).toContainText('points: 4');
    await expect(page.locator('#deckgl-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('cross section: samples a two-point line into an elevation profile', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('📐 Section').click();
    await expect(page.getByText('Cross Section')).toBeVisible();

    await page.getByRole('button', { name: 'Generate Profile' }).click();
    // The DEM fetch falls back to synthetic data, so a chart + stats always render.
    await expect(page.locator('svg[aria-label="elevation profile"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('crosssection-stats')).toBeVisible();
    await expect(page.getByTestId('crosssection-stats')).toContainText('Distance:');
  });
});
