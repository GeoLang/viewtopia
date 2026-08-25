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

/** Somewhere over land, so the default camera is irrelevant to the click. */
const VIEW = { lon: 7.425, lat: 43.735, zoom: 13 };
const CLICK_AT = { x: 240, y: 180 };

async function seedPointDataset(token, name, features) {
  return seedDataset(token, name, 'point', features);
}

async function seedDataset(token, name, geometryType, features) {
  const dataset = await ptolemy('/datasets', token, {
    method: 'POST',
    body: JSON.stringify({
      name,
      srid: 4326,
      geometry_type: geometryType,
      created_by: BROWSER_USER,
    }),
  });
  expect(dataset.status, JSON.stringify(dataset.json)).toBe(201);
  const branch = await ptolemy(`/datasets/${dataset.json.id}/branches`, token, {
    method: 'POST',
    body: JSON.stringify({ name: 'main', created_by: BROWSER_USER }),
  });
  expect(branch.status, JSON.stringify(branch.json)).toBe(201);
  if (features.length > 0) {
    const imported = await ptolemy(`/branches/${branch.json.id}/import/geojson`, token, {
      method: 'POST',
      body: JSON.stringify({ message: 'seed', author: BROWSER_USER, features }),
    });
    expect(imported.status, JSON.stringify(imported.json)).toBe(200);
  }
  return { datasetId: dataset.json.id, branchId: branch.json.id };
}

async function signIn(page, token) {
  await page.addInitScript((seed) => {
    localStorage.setItem('viewtopia-tour-done', '1');
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
  }, { user: { name: BROWSER_USER }, token });
  await page.goto('/');
}

async function mapReady(page) {
  await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, {
    timeout: 60_000,
  });
  await page.evaluate(
    (v) => window.__viewtopiaMap.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom }),
    VIEW,
  );
}

/** lng/lat the next canvas click at CLICK_AT lands on. */
function clickTarget(page) {
  return page.evaluate((at) => {
    const p = window.__viewtopiaMap.unproject([at.x, at.y]);
    return { lng: p.lng, lat: p.lat };
  }, CLICK_AT);
}

function wkbPoint(hex) {
  const buffer = Buffer.from(hex, 'hex');
  return { lng: buffer.readDoubleLE(5), lat: buffer.readDoubleLE(13) };
}

test.describe('the dataset editor commits a geometry edit', () => {
  test('a redrawn point is what the next session reads', async ({ page }) => {
    test.setTimeout(120_000);
    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no authenticated edit is possible').toBeTruthy();

    const datasetName = `redraw-e2e-${Date.now()}`;
    const { branchId } = await seedPointDataset(token, datasetName, [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [1, 2] },
        properties: { name: 'site A' },
      },
    ]);
    const listed = await ptolemy(`/branches/${branchId}/features`, token);
    const featureId = listed.json.features[0].id;

    await signIn(page, token);
    await mapReady(page);

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Dataset Editor' }).first().click();
    await page.getByPlaceholder('Pick a dataset').click();
    await page.getByRole('option', { name: datasetName }).click();
    await expect(page.getByTestId('dataset-editor-feature')).toHaveCount(1);
    await page.getByTestId('dataset-editor-feature').click();

    await page.getByTestId('dataset-editor-redraw').click();
    const expected = await clickTarget(page);
    await page.locator('#maplibre-container canvas').first().click({ position: CLICK_AT });

    await expect(page.getByTestId('dataset-editor-commit')).toBeEnabled();
    await page.getByTestId('dataset-editor-commit').click();
    await expect(page.getByTestId('dataset-editor-commit')).toBeDisabled();

    // a session that never saw the browser reads the new geometry back
    await expect
      .poll(async () => {
        const read = await ptolemy(`/branches/${branchId}/features/${featureId}`, token);
        return read.json?.geometry_wkb_hex ?? '';
      }, { timeout: 20_000 })
      .not.toBe(POINT_HEX);
    const read = await ptolemy(`/branches/${branchId}/features/${featureId}`, token);
    const point = wkbPoint(read.json.geometry_wkb_hex);
    expect(Math.abs(point.lng - expected.lng)).toBeLessThan(0.001);
    expect(Math.abs(point.lat - expected.lat)).toBeLessThan(0.001);
    // the redraw left the attributes alone
    expect(read.json.properties).toEqual({ name: 'site A' });
  });
});

test.describe('the draw panel inserts shapes into a branch', () => {
  test('a drawn point committed from the panel becomes a branch feature', async ({ page }) => {
    test.setTimeout(120_000);
    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no authenticated edit is possible').toBeTruthy();

    const datasetName = `draw-e2e-${Date.now()}`;
    const { branchId } = await seedPointDataset(token, datasetName, []);

    await signIn(page, token);
    await mapReady(page);

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Draw' }).first().click();
    // the segmented control's radio input is visually hidden
    await page.locator('.panel-dock label').filter({ hasText: 'Point' }).first().click();
    const expected = await clickTarget(page);
    await page.locator('#maplibre-container canvas').first().click({ position: CLICK_AT });
    await expect(page.getByRole('button', { name: 'Clear All (1)' })).toBeVisible();

    await page.getByTestId('draw-save-open').click();
    await page.getByPlaceholder('Pick a dataset').click();
    await page.getByRole('option', { name: datasetName }).click();
    await expect(page.getByPlaceholder('Pick a branch')).toHaveValue('main');
    await page.getByTestId('draw-save-commit').click();
    await expect(page.getByTestId('draw-save-notice')).toHaveText('1 shape(s) committed');

    // the shape left the browser-local list for the branch
    await expect(page.getByRole('button', { name: 'Clear All (0)' })).toBeVisible();
    const listed = await ptolemy(`/branches/${branchId}/features`, token);
    expect(listed.json.features).toHaveLength(1);
    const point = wkbPoint(
      Buffer.from(listed.json.features[0].geometry_wkb).toString('hex'),
    );
    expect(Math.abs(point.lng - expected.lng)).toBeLessThan(0.001);
    expect(Math.abs(point.lat - expected.lat)).toBeLessThan(0.001);
  });
});

/** Half the seeded square's width, about 58 px across at VIEW.zoom. */
const SQUARE_HALF_DEGREES = 0.01;
const DRAG_BY = { x: 60, y: -40 };

function seededSquare() {
  const west = VIEW.lon - SQUARE_HALF_DEGREES;
  const east = VIEW.lon + SQUARE_HALF_DEGREES;
  const south = VIEW.lat - SQUARE_HALF_DEGREES;
  const north = VIEW.lat + SQUARE_HALF_DEGREES;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/** The exterior ring of a 2D WKB polygon: order, type, ring count, point count. */
function wkbPolygonRing(hex) {
  const buffer = Buffer.from(hex, 'hex');
  const count = buffer.readUInt32LE(9);
  const ring = [];
  for (let i = 0; i < count; i++) {
    ring.push({
      lng: buffer.readDoubleLE(13 + i * 16),
      lat: buffer.readDoubleLE(21 + i * 16),
    });
  }
  return ring;
}

test.describe('the dataset editor commits a vertex drag', () => {
  test('a dragged vertex is what the next session reads', async ({ page }) => {
    test.setTimeout(120_000);
    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no authenticated edit is possible').toBeTruthy();

    const datasetName = `vertex-e2e-${Date.now()}`;
    const ring = seededSquare();
    const { branchId } = await seedDataset(token, datasetName, 'polygon', [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { name: 'corner lot' },
      },
    ]);
    const listed = await ptolemy(`/branches/${branchId}/features`, token);
    const featureId = listed.json.features[0].id;

    await signIn(page, token);
    await mapReady(page);

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Dataset Editor' }).first().click();
    await page.getByPlaceholder('Pick a dataset').click();
    await page.getByRole('option', { name: datasetName }).click();
    await expect(page.getByTestId('dataset-editor-feature')).toHaveCount(1);
    await page.getByTestId('dataset-editor-feature').click();
    await page.getByTestId('dataset-editor-edit-vertices').click();

    // the north-west corner, left of centre and clear of the panel dock
    const corner = ring[3];
    const start = await page.evaluate((position) => {
      const point = window.__viewtopiaMap.project(position);
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }, corner);
    const target = { x: start.x + DRAG_BY.x, y: start.y + DRAG_BY.y };
    // the camera holds still through the drag, so this is where the corner lands
    const expected = await page.evaluate((at) => {
      const position = window.__viewtopiaMap.unproject([at.x, at.y]);
      return { lng: position.lng, lat: position.lat };
    }, target);

    const canvas = await page.locator('#maplibre-container canvas').first().boundingBox();
    await page.mouse.move(canvas.x + start.x, canvas.y + start.y);
    await page.mouse.down();
    await page.mouse.move(canvas.x + target.x, canvas.y + target.y, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByTestId('dataset-editor-commit')).toBeEnabled();
    await page.getByTestId('dataset-editor-commit').click();
    await expect(page.getByTestId('dataset-editor-commit')).toBeDisabled();

    // a session that never saw the browser reads the moved corner back
    await expect
      .poll(async () => {
        const read = await ptolemy(`/branches/${branchId}/features/${featureId}`, token);
        const saved = wkbPolygonRing(read.json?.geometry_wkb_hex ?? '');
        return saved.some(
          (position) =>
            Math.abs(position.lng - expected.lng) < 0.0005 &&
            Math.abs(position.lat - expected.lat) < 0.0005,
        );
      }, { timeout: 20_000 })
      .toBe(true);

    // the three corners nobody touched stayed put
    const read = await ptolemy(`/branches/${branchId}/features/${featureId}`, token);
    const saved = wkbPolygonRing(read.json.geometry_wkb_hex);
    expect(saved).toHaveLength(ring.length);
    for (const index of [0, 1, 2]) {
      expect(Math.abs(saved[index].lng - ring[index][0])).toBeLessThan(0.000001);
      expect(Math.abs(saved[index].lat - ring[index][1])).toBeLessThan(0.000001);
    }
  });
});
