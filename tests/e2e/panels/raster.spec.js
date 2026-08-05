import { writeArrayBuffer } from 'geotiff';
import { test, expect } from '../console-guard';
import { MENU_ITEM, PANEL, openApp } from '../panel-helpers';

/**
 * The raster panel computes in a worker over the terrano wasm bundle, and this
 * is the only place that path runs in a real browser: the unit tests call the
 * wasm module directly and never cross the worker boundary. The DEM is
 * generated in-test with geotiff.js, so the panel needs no backend at all.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/raster.spec.js
 */

/** 40x40 south-dipping ramp over Monaco-ish coordinates, EPSG:4326. */
async function demTif() {
  const size = 40;
  const values = new Array(size * size).fill(0).map((_, i) => Math.floor(i / size) * 5);
  const buffer = await writeArrayBuffer(values, {
    height: size,
    width: size,
    ModelPixelScale: [0.001, 0.001, 0],
    ModelTiepoint: [0, 0, 0, 7.0, 46.0, 0],
    GeographicTypeGeoKey: 4326,
  });
  return Buffer.from(buffer);
}

/**
 * 8x8 two-band tif: band 1 green, band 2 nir, water on the left half.
 * geotiff.js writes these as 8-bit DN, so the values stay whole.
 */
async function twoBandTif() {
  const size = 8;
  const green = [];
  const nir = [];
  for (let y = 0; y < size; y++) {
    green.push(Array.from({ length: size }, (_, x) => (x < size / 2 ? 200 : 50)));
    nir.push(Array.from({ length: size }, (_, x) => (x < size / 2 ? 50 : 150)));
  }
  const buffer = await writeArrayBuffer([green, nir], {
    height: size,
    width: size,
    ModelPixelScale: [0.01, 0.01, 0],
    ModelTiepoint: [0, 0, 0, 7.0, 46.0, 0],
    GeographicTypeGeoKey: 4326,
  });
  return Buffer.from(buffer);
}

test('raster panel runs terrano wasm ops on an uploaded dem', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Raster Analysis' }).first().click();
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: 'Raster Analysis' });
  await expect(panel).toHaveCount(1);

  await panel.locator('input[type="file"]').setInputFiles({
    name: 'dem.tif',
    mimeType: 'image/tiff',
    buffer: await demTif(),
  });
  await expect(panel.getByText('40×40 · 1 band · EPSG:4326')).toBeVisible();

  // first run initializes the worker and the wasm module
  await panel.getByRole('button', { name: 'Run hillshade' }).click();
  await expect(panel.getByText('Result: hillshade')).toBeVisible({ timeout: 30000 });
  await expect(panel.locator('img[alt="hillshade"]')).toBeVisible();

  await panel.getByRole('button', { name: 'Run slope' }).click();
  await expect(panel.getByText('Result: slope')).toBeVisible({ timeout: 15000 });

  // focal stats smooth band 1 in a moving window
  await panel.getByRole('button', { name: 'Run focal statistics' }).click();
  await expect(panel.getByText('Result: focal')).toBeVisible({ timeout: 15000 });

  // reclass bins band 1, with the classes generated from its own range
  await panel.getByRole('button', { name: 'Fill' }).click();
  await panel.getByRole('button', { name: 'Run reclass' }).click();
  await expect(panel.getByText('Result: reclass')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Min 1.000')).toBeVisible();
  await expect(panel.getByText('Max 5.000')).toBeVisible();

  // zonal stats summarize band 1 grouped by those same classes
  await panel.getByLabel('Zones').click();
  await page.getByRole('option', { name: 'Result: reclass' }).click();
  await panel.getByRole('button', { name: 'Run zonal statistics' }).click();
  await expect(panel.getByText('Zonal result')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('5 zones')).toBeVisible();

  // polygonize the classes just produced: each class is a contiguous band of
  // rows, so the five classes trace five polygons
  await panel.getByLabel('Polygonize input').click();
  await page.getByRole('option', { name: 'Result: reclass' }).click();
  await panel.getByRole('button', { name: 'Run polygonize' }).click();
  await expect(panel.getByText('5 polygons')).toBeVisible({ timeout: 15000 });
  await panel.getByRole('button', { name: 'Add as layer' }).click();

  await panel.getByRole('button', { name: 'Run contours' }).click();
  await expect(panel.getByText(/\d+ contour lines/)).toBeVisible({ timeout: 15000 });

  // 4326 raster, so the layer path is live; the console guard fails the test
  // if the renderer rejects it
  const addAsLayer = panel.getByRole('button', { name: 'Add as layer' });
  await expect(addAsLayer).toBeEnabled();
  await addAsLayer.click();

  // both results are real layers now, listed and removable rather than one
  // drape the next run replaces
  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  await expect(layerPanel.getByText('polygons')).toBeVisible();
  await expect(layerPanel.getByText('contours')).toBeVisible();
});

test('a raster result becomes a layer that stacks and can be removed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Raster Analysis' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Raster Analysis' });

  await panel.locator('input[type="file"]').setInputFiles({
    name: 'dem.tif',
    mimeType: 'image/tiff',
    buffer: await demTif(),
  });
  await expect(panel.getByText('40×40 · 1 band · EPSG:4326')).toBeVisible();

  await panel.getByRole('button', { name: 'Run hillshade' }).click();
  await expect(panel.getByText('Result: hillshade')).toBeVisible({ timeout: 30000 });
  await panel.getByRole('button', { name: 'Add as layer' }).click();

  await panel.getByRole('button', { name: 'Run aspect' }).click();
  await expect(panel.getByText('Result: aspect')).toBeVisible({ timeout: 15000 });
  await panel.getByRole('button', { name: 'Add as layer' }).click();

  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  await expect(layerPanel.getByText('Layers (2)')).toBeVisible();

  await layerPanel.getByTestId('raster-layer-row').first().click();
  await layerPanel.getByRole('button', { name: 'Remove' }).click();
  await expect(layerPanel.getByText('Layers (1)')).toBeVisible();
});

test('spectral index presets pick their own bands', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Raster Analysis' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Raster Analysis' });

  await panel.locator('input[type="file"]').setInputFiles({
    name: 'scene.tif',
    mimeType: 'image/tiff',
    buffer: await twoBandTif(),
  });
  await expect(panel.getByText('8×8 · 2 bands · EPSG:4326')).toBeVisible();

  await panel.getByLabel('Index preset').click();
  await page.getByRole('option', { name: /NDWI/ }).click();
  await panel.getByLabel('Green band').fill('1');
  await panel.getByLabel('NIR band').fill('2');

  await panel.getByRole('button', { name: 'Run index' }).click();
  await expect(panel.getByText('Result: ndwi')).toBeVisible({ timeout: 30000 });
  // water half is (200 - 50) / 250, land half is (50 - 150) / 200
  await expect(panel.getByText('Min -0.500')).toBeVisible();
  await expect(panel.getByText('Max 0.600')).toBeVisible();

  // EVI runs the expression path instead, over three picked bands
  await panel.getByLabel('Index preset').click();
  await page.getByRole('option', { name: /EVI/ }).click();
  await panel.getByLabel('NIR band').fill('2');
  await panel.getByLabel('Red band').fill('1');
  await panel.getByLabel('Blue band').fill('1');
  await panel.getByRole('button', { name: 'Run index' }).click();
  await expect(panel.getByText('Result: evi')).toBeVisible({ timeout: 15000 });
});
