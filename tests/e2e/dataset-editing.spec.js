import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * P0 item 3 end to end against the live platform stack: edit one feature's
 * attributes in the Dataset Editor, commit them, and read the change back from
 * a session that never touched the browser.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/dataset-editing.spec.js
 *
 * Ptolemy is reached directly (localhost:3000) only to seed the dataset and to
 * play the second session. Everything the panel does goes through the SPA's
 * same-origin /api proxy.
 */

const PTOLEMY = 'http://localhost:3000';
const BROWSER_USER = 'dataset-editor-e2e';
// point (1 2), the geometry the seeded feature keeps across a property edit
const POINT_HEX = '0101000000000000000000f03f0000000000000040';

const MENU_ITEM = '[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]';

async function ptolemy(path, token, init) {
  const res = await fetch(`${PTOLEMY}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.text();
  return { status: res.status, json: body ? JSON.parse(body) : null };
}

test.describe('the dataset editor commits an attribute edit', () => {
  test('an edit made in the browser is what the next session reads', async ({ page }) => {
    test.setTimeout(120_000);

    // sign in as the sub that owns the dataset
    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no authenticated edit is possible').toBeTruthy();

    const datasetName = `edit-e2e-${Date.now()}`;

    const dataset = await ptolemy('/datasets', token, {
      method: 'POST',
      body: JSON.stringify({
        name: datasetName,
        srid: 4326,
        geometry_type: 'point',
        created_by: BROWSER_USER,
      }),
    });
    expect(dataset.status, JSON.stringify(dataset.json)).toBe(201);

    const branch = await ptolemy(`/datasets/${dataset.json.id}/branches`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'main', created_by: BROWSER_USER }),
    });
    expect(branch.status, JSON.stringify(branch.json)).toBe(201);

    const imported = await ptolemy(`/branches/${branch.json.id}/import/geojson`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: 'import one site',
        author: BROWSER_USER,
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1, 2] },
            properties: { name: 'site A', acres: 1.5 },
          },
        ],
      }),
    });
    expect(imported.status, JSON.stringify(imported.json)).toBe(200);
    expect(imported.json.imported).toBe(1);

    // the import mints its own feature ids
    const listed = await ptolemy(`/branches/${branch.json.id}/features`, token);
    expect(listed.json.features).toHaveLength(1);
    const featureId = listed.json.features[0].id;

    await page.addInitScript((seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    }, { user: { name: BROWSER_USER }, token });
    await page.goto('/');

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Dataset Editor' }).first().click();

    await page.getByPlaceholder('Pick a dataset').click();
    await page.getByRole('option', { name: datasetName }).click();

    await expect(page.getByTestId('dataset-editor-feature')).toHaveCount(1);
    await page.getByTestId('dataset-editor-feature').click();

    await page.getByTestId('property-value-name').fill('site A renamed');
    await page.getByTestId('dataset-editor-commit').click();
    await expect(page.getByTestId('dataset-editor-commit')).toBeDisabled();

    // Reload re-reads the branch, not the panel's own copy of the edit
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByTestId('dataset-editor-feature')).toHaveText('site A renamed');

    await page.getByRole('button', { name: 'Show on map' }).click();
    await page.getByRole('button', { name: 'Layers' }).click();
    await expect(page.getByText(`ptolemy-branch-${branch.json.id}`)).toBeVisible();

    // a session that never saw the browser reads the edit back
    await expect
      .poll(
        async () =>
          (await ptolemy(`/branches/${branch.json.id}/features/${featureId}`, token)).json,
        { timeout: 20_000 },
      )
      .toEqual({
        feature_id: featureId,
        geometry_wkb_hex: POINT_HEX,
        properties: { name: 'site A renamed', acres: 1.5 },
      });
  });
});
