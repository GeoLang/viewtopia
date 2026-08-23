import { test, expect } from './console-guard';
import { PANEL, MENU_ITEM } from './panel-helpers';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * A vector file built into a tileset by the server and drawn as tiles: the
 * upload, the build, the martin TileJSON the map reads, the layer on the map,
 * and the delete that takes both away.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/tileset-import.spec.js
 *
 * tippecanoe runs inside the tiletopia image, so this needs that image built
 * from a master that installs it.
 */

const BROWSER_USER = 'tileset-e2e';
const NAME_PREFIX = 'tileset-e2e-plots';
// the archives outlive the run, so each one is named for the run that built it
const FILE_NAME = `${NAME_PREFIX}-${Date.now()}.geojson`;
const TILESETS_URL = 'http://localhost:5174/tiles/v1/tilesets';

const PLOTS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { plot: 'north' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [12.33, 45.44],
            [12.34, 45.44],
            [12.34, 45.45],
            [12.33, 45.45],
            [12.33, 45.44],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { plot: 'south' },
      geometry: { type: 'Point', coordinates: [12.335, 45.435] },
    },
  ],
};

function authHeaders() {
  return { Authorization: `Bearer ${mintToken({ role: 'editor', sub: BROWSER_USER })}` };
}

/** Archives a run that failed part way through left on the server. */
async function deleteLeftovers() {
  const response = await fetch(TILESETS_URL, { headers: authHeaders() });
  const rows = await response.json();
  for (const row of rows.filter((r) => r.name.startsWith(NAME_PREFIX))) {
    await fetch(`${TILESETS_URL}/${row.id}`, { method: 'DELETE', headers: authHeaders() });
  }
}

async function openApp(page) {
  const token = mintToken({ role: 'editor', sub: BROWSER_USER });
  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed.auth));
    },
    { auth: { user: { name: BROWSER_USER }, token } },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });
}

/** The vector tile sources the OGC hook put on the map. */
function tilesetSources(page) {
  return page.evaluate(() =>
    Object.keys(window.__viewtopiaMap?.getStyle()?.sources ?? {}).filter((id) =>
      id.startsWith('ogc-layer-tileset-'),
    ),
  );
}

/** The style layers drawn from those sources, one per geometry kind. */
function tilesetStyleLayers(page) {
  return page.evaluate(() =>
    (window.__viewtopiaMap?.getStyle()?.layers ?? [])
      .filter((layer) => String(layer.source ?? '').startsWith('ogc-layer-tileset-'))
      .map((layer) => layer.type),
  );
}

test('a vector file becomes a server tileset, a layer, and then nothing', async ({ page }) => {
  test.setTimeout(180_000);
  expect(mintToken(), 'the stack must be running with a platform secret').not.toBeNull();

  await deleteLeftovers();
  await openApp(page);

  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Data Sources' }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: 'Data Sources' });
  await panel.getByRole('tab', { name: 'Files' }).click();

  await panel.locator('input[type="file"]').setInputFiles({
    name: FILE_NAME,
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(PLOTS)),
  });
  await expect(panel.getByTestId('import-status')).toContainText('2 features');

  // the same file offered to the builder, which is the below-threshold route
  await panel.getByTestId('build-tileset').click();
  const offer = page.getByTestId('tileset-offer');
  await expect(offer).toBeVisible();

  // the map reads the archive's TileJSON before it can draw a tile from it
  const tileJson = page.waitForResponse(
    (response) => /^\/martin\/[0-9a-f-]{36}$/.test(new URL(response.url()).pathname),
    { timeout: 150_000 },
  );
  const tile = page.waitForResponse(
    (response) => /^\/martin\/[0-9a-f-]{36}\/\d+\/\d+\/\d+$/.test(new URL(response.url()).pathname),
    { timeout: 150_000 },
  );
  await page.getByTestId('tileset-build').click();
  expect((await tileJson).status()).toBe(200);
  await expect(offer).toBeHidden({ timeout: 150_000 });

  await expect.poll(() => tilesetSources(page), { timeout: 30_000 }).toHaveLength(1);
  expect(await tilesetStyleLayers(page)).toEqual(['fill', 'line', 'circle']);
  // an empty tile is a 204, so either says the map reached the archive
  expect([200, 204]).toContain((await tile).status());

  await page.getByRole('button', { name: 'Layers' }).click();
  const layerPanel = page.locator(PANEL).filter({ hasText: 'Layers (' });
  const row = layerPanel.getByTestId('tileset-row').filter({ hasText: FILE_NAME });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('ready')).toBeVisible();
  await expect(row.getByText(/^built /)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove layer' })).toBeVisible();

  await row.getByTestId('tileset-delete').click();
  await row.getByTestId('tileset-delete-confirm').click();

  await expect(row).toHaveCount(0);
  await expect.poll(() => tilesetSources(page), { timeout: 30_000 }).toHaveLength(0);
});
