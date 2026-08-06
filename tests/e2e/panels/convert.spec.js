import { readFile } from 'node:fs/promises';
import { test, expect } from '../console-guard';
import { MENU_ITEM, PANEL, openApp } from '../panel-helpers';

/**
 * The convert panel writes its formats in the browser and hands them to a
 * download, so this is the only place the whole path runs: duckdb-wasm loads
 * the spatial extension in its worker, the flatgeobuf and pmtiles writers run
 * on the main thread, and Chromium takes the blob anchor. The bytes each
 * download produced are read back here.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/convert.spec.js
 */

const box = (w, s, e, n, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  },
});

/**
 * A degree across, not the usual parcel-sized box: geojson-vt simplifies
 * anything smaller away at zoom 0, and the pmtiles writer stops at the first
 * empty tile, so a small layer exports as "no features to export".
 */
const PARCELS = [
  box(7, 45, 8, 46, { region: 'x' }),
  box(8, 45, 9, 46, { region: 'x' }),
  box(10, 45, 11, 46, { region: 'y' }),
];

function geojsonFile(name, features) {
  return {
    name,
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })),
  };
}

async function importLayer(page, name, features) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Import' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Import Data' });
  await panel.locator('input[type="file"]').setInputFiles(geojsonFile(name, features));
  await expect(panel.getByTestId('import-status')).toHaveText(
    `${name}: ${features.length} features`,
  );
  // the panel sits where the menus open, so it has to go before the next one
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

async function openConvert(page) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Convert' }).first().click();
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: 'Convert' });
  await expect(panel).toHaveCount(1);
  return panel;
}

/** Mantine selects open a listbox in a portal, so the option is off the panel. */
async function choose(page, panel, label, option) {
  await panel.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Convert with whatever is picked and read back what the browser saved. */
async function convert(page, panel, timeout = 30000) {
  const saved = page.waitForEvent('download', { timeout });
  await panel.getByRole('button', { name: 'Convert and download' }).click();
  const download = await saved;
  const bytes = await readFile(await download.path());
  return { name: download.suggestedFilename(), bytes };
}

test('converts an imported layer to GeoParquet and FlatGeobuf', async ({ page }) => {
  await openApp(page);
  await importLayer(page, 'parcels.geojson', PARCELS);
  const panel = await openConvert(page);

  await choose(page, panel, 'Layer', 'parcels.geojson');
  await expect(panel.getByText('3 features')).toBeVisible();

  // GeoParquet is the default format; the first run boots duckdb-wasm and
  // loads the spatial extension over the network
  const parquet = await convert(page, panel, 90000);
  expect(parquet.name).toBe('parcels.parquet');
  expect(parquet.bytes.length).toBeGreaterThan(0);
  expect(parquet.bytes.subarray(0, 4).toString()).toBe('PAR1');
  // the "geo" key is what makes it GeoParquet rather than parquet with a blob
  expect(parquet.bytes.toString('latin1')).toContain('"primary_column":"geom"');
  await expect(panel.getByTestId('convert-result')).toContainText('parcels.parquet:');

  await choose(page, panel, 'Format', 'FlatGeobuf');
  const fgb = await convert(page, panel);
  expect(fgb.name).toBe('parcels.fgb');
  expect(fgb.bytes.length).toBeGreaterThan(0);
  expect(fgb.bytes.subarray(0, 3).toString()).toBe('fgb');
  await expect(panel.getByTestId('convert-result')).toContainText('parcels.fgb:');
});

test('converts the same layer to PMTiles and GeoJSON', async ({ page }) => {
  await openApp(page);
  await importLayer(page, 'parcels.geojson', PARCELS);
  const panel = await openConvert(page);

  await choose(page, panel, 'Layer', 'parcels.geojson');

  await choose(page, panel, 'Format', 'PMTiles');
  const pmtiles = await convert(page, panel);
  expect(pmtiles.name).toBe('parcels.pmtiles');
  expect(pmtiles.bytes.subarray(0, 7).toString()).toBe('PMTiles');

  await choose(page, panel, 'Format', 'GeoJSON');
  const geojson = await convert(page, panel);
  expect(geojson.name).toBe('parcels.geojson');
  expect(JSON.parse(geojson.bytes.toString()).features).toHaveLength(3);
});
