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

  await panel.getByRole('button', { name: 'Run contours' }).click();
  await expect(panel.getByText(/\d+ contour lines/)).toBeVisible({ timeout: 15000 });

  // 4326 raster, so the drape path is live; the console guard fails the test
  // if the renderer rejects it
  const addToMap = panel.getByRole('button', { name: 'Add to map' });
  await expect(addToMap).toBeEnabled();
  await addToMap.click();
});
