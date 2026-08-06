import { test, expect } from '../console-guard';
import { MENU_ITEM, PANEL, openApp } from '../panel-helpers';

/**
 * The geoprocessing panel computes in a worker over the topoi wasm bundle, and
 * this is the only place that path runs in a real browser: the unit tests call
 * the wasm module directly and never cross the worker boundary. Inputs are
 * GeoJSON files imported in-test, so the panel needs no backend at all.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/toolbox.spec.js
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

/** two touching parcels in one region and a detached one in another */
const PARCELS = [
  box(7, 45, 7.1, 45.1, { region: 'x' }),
  box(7.1, 45, 7.2, 45.1, { region: 'x' }),
  box(7.3, 45, 7.4, 45.1, { region: 'y' }),
];

/** a ring that crosses itself, which is what the validity check reports on */
const BOWTIE = [
  {
    type: 'Feature',
    properties: { name: 'bowtie' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [7, 45],
          [7.1, 45.1],
          [7.1, 45],
          [7, 45.1],
          [7, 45],
        ],
      ],
    },
  },
];

function geojsonFile(name, features) {
  return {
    name,
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })),
  };
}

/** Import a GeoJSON file, which lands as a layer every panel can read. */
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

async function openToolbox(page) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Geoprocessing' }).first().click();
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: 'Geoprocessing' });
  await expect(panel).toHaveCount(1);
  return panel;
}

/** Mantine selects open a listbox in a portal, so the option is off the panel. */
async function choose(page, panel, label, option) {
  await panel.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('the toolbox runs topoi wasm tools on an imported layer', async ({ page }) => {
  await openApp(page);
  await importLayer(page, 'parcels.geojson', PARCELS);
  const panel = await openToolbox(page);

  // first run initializes the worker and the wasm module
  await choose(page, panel, 'Input layer', 'parcels.geojson');
  await panel.getByLabel('Distance (m)').fill('500');
  await panel.getByRole('button', { name: 'Run tool' }).click();
  await expect(panel.getByText('Buffer: 3 features')).toBeVisible({ timeout: 30000 });
  await panel.getByRole('button', { name: 'Add as layer' }).click();

  // dissolve groups the two touching parcels by their field and leaves the
  // third; the input picked above carries across the tool switch
  await choose(page, panel, 'Tool', 'Dissolve');
  await choose(page, panel, 'Field', 'region');
  await panel.getByRole('button', { name: 'Run tool' }).click();
  await expect(panel.getByText('Dissolve: 2 features')).toBeVisible({ timeout: 15000 });

  // centroids read the result of the run before them
  await choose(page, panel, 'Tool', 'Centroid');
  await choose(page, panel, 'Input layer', 'Last result');
  await panel.getByRole('button', { name: 'Run tool' }).click();
  await expect(panel.getByText('Centroid: 2 features')).toBeVisible({ timeout: 15000 });

  // the cell size is metres: 0.01 degrees at 45N is 787 m across and 1105 m
  // high, so 200 m cells tile it 4 by 6
  await choose(page, panel, 'Tool', 'Square grid');
  await panel.getByLabel('Extent (w,s,e,n)').fill('7,45,7.01,45.01');
  await panel.getByLabel('Cell size (m)').fill('200');
  await panel.getByRole('button', { name: 'Run tool' }).click();
  await expect(panel.getByText('Square grid: 24 features')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  await expect(layerPanel.getByText('Buffer')).toBeVisible();
  await expect(layerPanel.getByText('parcels.geojson')).toBeVisible();
});

test('the validity report names the issue and hands the input to make valid', async ({ page }) => {
  await openApp(page);
  await importLayer(page, 'bowtie.geojson', BOWTIE);
  const panel = await openToolbox(page);

  await choose(page, panel, 'Tool', 'Check validity');
  await choose(page, panel, 'Input layer', 'bowtie.geojson');
  await panel.getByRole('button', { name: 'Run tool' }).click();
  await expect(panel.getByText('1 invalid features')).toBeVisible({ timeout: 30000 });
  await expect(panel.getByText(/Feature 1: .*crosses itself/)).toBeVisible();

  // the repair runs on what the check read, so nothing has to be picked again
  await panel.getByRole('button', { name: 'Make valid' }).click();
  await expect(panel.getByText('Make valid: 1 features')).toBeVisible({ timeout: 15000 });
  await panel.getByRole('button', { name: 'Add as layer' }).click();

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(
    page.locator(PANEL).filter({ hasText: 'Layers (' }).getByText('Make valid'),
  ).toBeVisible();
});

test('a batch feeds each step the one before it and stops at the first error', async ({ page }) => {
  await openApp(page);
  await importLayer(page, 'parcels.geojson', PARCELS);
  const panel = await openToolbox(page);

  await choose(page, panel, 'Input layer', 'parcels.geojson');
  await panel.getByRole('button', { name: 'Add step', exact: true }).click();
  await choose(page, panel, 'Tool', 'Centroid');
  await panel.getByRole('button', { name: 'Add step', exact: true }).click();

  await panel.getByRole('button', { name: 'Run batch' }).click();
  await expect(panel.getByText('3 features')).toHaveCount(2, { timeout: 30000 });

  // the centroids of step 2 are points, which dissolve refuses, and the run
  // stops there naming the step
  await choose(page, panel, 'Tool', 'Dissolve');
  await panel.getByRole('button', { name: 'Add step', exact: true }).click();
  await panel.getByRole('button', { name: 'Run batch' }).click();
  await expect(panel.getByText(/step 3 \(Dissolve\) failed:/)).toBeVisible({ timeout: 30000 });
  await expect(panel.getByText('3 features')).toHaveCount(2);

  // any step's own result is a layer on its own
  await panel.getByRole('button', { name: 'Add step 1 as layer' }).click();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(
    page.locator(PANEL).filter({ hasText: 'Layers (' }).getByText('Buffer'),
  ).toBeVisible();
});
