import { test, expect } from '../console-guard';
import { MENU_ITEM, PANEL, openApp } from '../panel-helpers';

/**
 * The attribute table's upgrades against the live stack: column sorting, the
 * field calculator writing back to the layer every renderer draws, and an
 * attribute join landing as a new layer. The calculator and the join run their
 * SQL in duckdb-wasm in the browser, so this is the only place that whole path
 * runs.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/attribute-table.spec.js
 */

const box = (w, s, properties) => ({
  type: 'Feature',
  properties,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [w + 1, s],
        [w + 1, s + 1],
        [w, s + 1],
        [w, s],
      ],
    ],
  },
});

/** A degree across: sub-degree geometry disappears from the renderers at low zoom. */
const PARCELS = [
  box(7, 45, { parcel: 'A-100', pop: 1200, area: 3 }),
  box(9, 45, { parcel: 'B-200', pop: 400, area: 2 }),
  box(11, 45, { parcel: 'C-300', pop: 900, area: 4 }),
];

/** Two of the three parcels, so the join has a miss to leave null. */
const CENSUS = [
  box(20, 45, { parcel: 'A-100', residents: 5 }),
  box(22, 45, { parcel: 'C-300', residents: 9 }),
];

function geojsonFile(name, features) {
  return {
    name,
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })),
  };
}

/** Both layers on the globe, through the Import panel, which every renderer draws. */
async function importLayers(page) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Data Sources' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Data Sources' });
  await panel.getByRole('tab', { name: 'Files' }).click();
  const input = panel.locator('input[type="file"]');

  await input.setInputFiles(geojsonFile('parcels.geojson', PARCELS));
  await expect(panel.getByTestId('import-status')).toHaveText('parcels.geojson: 3 features');
  await input.setInputFiles(geojsonFile('census.geojson', CENSUS));
  await expect(panel.getByTestId('import-status')).toHaveText('census.geojson: 2 features');

  // the panel sits where the menus open, so it has to go before the next one
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

async function openTable(page) {
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Data Table' }).first().click();
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: 'Attribute Table' });
  await expect(panel).toHaveCount(1);

  // the layer picker names data sources, so the imports are told apart by count
  await panel.getByPlaceholder('Select layer…').click();
  await page.getByRole('option', { name: /\(3\)$/ }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(3);
  return panel;
}

/** What the live Cesium scene holds, layer by layer, with each feature's attributes. */
function drawn(page) {
  return page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    const time = v.clock.currentTime;
    return Array.from({ length: v.dataSources.length }, (_, i) => {
      const ds = v.dataSources.get(i);
      return {
        name: ds.name,
        features: ds.entities.values.map((e) => e.properties?.getValue(time) ?? {}),
      };
    });
  });
}

const firstColumn = (panel) => panel.locator('tbody tr td:first-child');

test('sorts a column and writes a calculated field onto the layer', async ({ page }) => {
  await openApp(page);
  await importLayers(page);
  const panel = await openTable(page);

  // the layer's own order, then ascending and descending by a numeric column,
  // which text ordering would put 1200 before 400
  await expect(firstColumn(panel)).toHaveText(['A-100', 'B-200', 'C-300']);
  const popHeader = panel.locator('thead th').filter({ hasText: 'pop' });
  await popHeader.click();
  await expect(firstColumn(panel)).toHaveText(['B-200', 'C-300', 'A-100']);
  await popHeader.click();
  await expect(firstColumn(panel)).toHaveText(['A-100', 'C-300', 'B-200']);
  await popHeader.click();
  await expect(firstColumn(panel)).toHaveText(['A-100', 'B-200', 'C-300']);

  // a virtual field is display-only: it shows as a column and the features on
  // the globe never hear about it
  await panel.getByRole('button', { name: 'Fields' }).click();
  await panel.getByLabel('Field name').fill('per_area');
  await panel.getByLabel('Expression (SQL)').fill('pop / area');
  await panel.getByRole('button', { name: 'Add virtual field' }).click();
  await expect(panel.locator('thead th')).toHaveText(['parcel', 'pop', 'area', 'per_area']);
  // the first duckdb call boots the wasm bundle over the network
  await expect(panel.locator('tbody tr td:last-child')).toHaveText(['400', '200', '225'], {
    timeout: 90000,
  });
  const beforeCalculating = await drawn(page);
  expect(beforeCalculating[0].features.map((f) => f.per_area)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);

  // the calculator materializes instead: the same expression written into the
  // layer's own features, which is what the scene redraws
  await panel.getByLabel('Field name').fill('density');
  await panel.getByLabel('Expression (SQL)').fill('pop / area');
  await panel.getByRole('button', { name: 'Add to layer' }).click();
  await expect(panel.getByTestId('attr-field-status')).toHaveText(
    'density added to parcels.geojson (3 features)',
    { timeout: 90000 },
  );

  await expect
    .poll(async () => (await drawn(page))[0].features.map((f) => f.density), { timeout: 30000 })
    .toEqual([400, 200, 225]);
  // the layer was replaced, not added to
  const after = await drawn(page);
  expect(after).toHaveLength(2);
  expect(after[0].features.map((f) => f.parcel)).toEqual(['A-100', 'B-200', 'C-300']);

  // and the table, reading the scene, shows the materialized column too
  await expect(panel.locator('thead th')).toHaveText([
    'parcel',
    'pop',
    'area',
    'density',
    'per_area',
  ]);
  await expect(panel.locator('tbody tr td:nth-child(4)')).toHaveText(['400', '200', '225']);

  // the stats read whatever column is picked, over the rows the filter left
  await panel.getByRole('button', { name: 'Stats' }).click();
  await panel.getByLabel('Column').click();
  await page.getByRole('option', { name: 'pop', exact: true }).click();
  await expect(panel.getByTestId('attr-stats')).toHaveText(
    'count 3 · distinct 3 · min 400 · max 1200 · mean 833.333 · median 900',
  );
  await expect(panel.locator('svg[role="img"]')).toHaveAttribute('aria-label', 'bar chart');

  await panel.getByPlaceholder('Filter…').fill('A-100');
  await expect(panel.getByTestId('attr-stats')).toHaveText(
    'count 1 · distinct 1 · min 1200 · max 1200 · mean 1200 · median 1200',
  );

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('joins a second layer and lands the result as a new layer', async ({ page }) => {
  await openApp(page);
  await importLayers(page);
  const panel = await openTable(page);

  await panel.getByRole('button', { name: 'Join' }).click();
  await panel.getByLabel('Join layer').click();
  await page.getByRole('option', { name: 'census.geojson' }).click();
  await panel.getByLabel('Table field').click();
  await page.getByRole('option', { name: 'parcel', exact: true }).click();
  await panel.getByLabel('Join field').click();
  await page.getByRole('option', { name: 'parcel', exact: true }).click();
  await panel.getByRole('button', { name: 'Join layers' }).click();

  await expect(panel.getByTestId('attr-join-status')).toHaveText(
    'parcels.geojson + census.geojson: 3 features',
    { timeout: 90000 },
  );

  // a third layer on the globe, carrying the matched attributes on the left
  // layer's own geometry, with the unmatched parcel kept and left null
  await expect.poll(async () => (await drawn(page)).length, { timeout: 30000 }).toBe(3);
  const layers = await drawn(page);
  expect(layers[2].name).toMatch(/^agent-layer-join-/);
  expect(layers[2].features.map((f) => f.parcel)).toEqual(['A-100', 'B-200', 'C-300']);
  expect(layers[2].features.map((f) => f.residents)).toEqual([5, null, 9]);
  // the joined key collided with the table's own column, so it arrived prefixed
  expect(layers[2].features[0].census_parcel).toBe('A-100');

  // the table layer itself is untouched by the join
  expect(layers[0].features[0]).toEqual({ parcel: 'A-100', pop: 1200, area: 3 });

  // and the new layer is a layer like any other: the table can read it
  await panel.getByPlaceholder('Select layer…').click();
  await page.getByRole('option', { name: /^agent-layer-join-/ }).click();
  await expect(panel.locator('thead th')).toHaveText([
    'parcel',
    'pop',
    'area',
    'census_parcel',
    'residents',
  ]);
  await expect(panel.locator('tbody tr')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
