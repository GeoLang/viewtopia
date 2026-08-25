import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * Scenario compare against the live platform stack: a base branch and a branch
 * with one extra sensor, drawn one per split pane, with ptolemy's buffered
 * coverage on each side.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/digital-twin-scenario.spec.js
 */

const PTOLEMY = 'http://localhost:3000';
const BROWSER_USER = 'scenario-e2e';

const MENU_ITEM = '[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]';

/** Monaco, matching the other platform specs. */
const ANCHOR = [7.42, 43.734];
/** ~40 m apart, so the base sensors sit inside one buffer of each other. */
const SENSOR_SPACING_DEGREES = 0.0005;
const BASE_SENSOR_COUNT = 3;

const METERS_PER_DEGREE_LATITUDE = 111_320;
/** Far enough north that a 100 m buffer around it touches none of the base's. */
const EXTRA_SENSOR_NORTH_METERS = 200;

/** Pane indexes the viewer registry files the two maps under. */
const VIEWER_PANE = 0;
const COMPARE_PANE = 1;

/** The buffer the compare asks ptolemy for. */
const COVERAGE_DISTANCE_METERS = 100;

async function ptolemy(path, token, init) {
  const response = await fetch(`${PTOLEMY}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.text();
  return { status: response.status, json: body ? JSON.parse(body) : null };
}

function sensorFeature(index) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [ANCHOR[0] + index * SENSOR_SPACING_DEGREES, ANCHOR[1]],
    },
    properties: { asset_id: `SCENARIO-${index + 1}`, name: `Sensor ${index + 1}` },
  };
}

function extraSensorFeature() {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [
        ANCHOR[0],
        ANCHOR[1] + EXTRA_SENSOR_NORTH_METERS / METERS_PER_DEGREE_LATITUDE,
      ],
    },
    properties: { asset_id: 'SCENARIO-EXTRA', name: 'New sensor' },
  };
}

/** The agent layer sources one pane's map holds. The viewer is pane 0. */
function sourcesOf(page, paneIndex) {
  return page.evaluate((index) => {
    const map = index === 0 ? window.__viewtopiaMap : window.__viewtopiaPaneMaps?.[index];
    return Object.keys(map?.getStyle()?.sources ?? {});
  }, paneIndex);
}

const SQUARE_METERS_PER_HECTARE = 10_000;

/** The area one coverage line shows, in square metres whichever unit it used. */
function coverageSquareMeters(text) {
  const found = /([\d.]+)\s*(ha|m²)\s*$/.exec(text.trim());
  if (!found) return Number.NaN;
  return Number(found[1]) * (found[2] === 'ha' ? SQUARE_METERS_PER_HECTARE : 1);
}

test.describe('a scenario branch is compared against its base', () => {
  test('each pane draws one branch, and the coverage difference is the new sensor', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const token = mintToken({ role: 'admin', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no branch can be seeded').toBeTruthy();

    const datasetName = `scenario-e2e-${Date.now()}`;
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

    const base = await ptolemy(`/datasets/${dataset.json.id}/branches`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'main', created_by: BROWSER_USER }),
    });
    expect(base.status, JSON.stringify(base.json)).toBe(201);

    const imported = await ptolemy(`/branches/${base.json.id}/import/geojson`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: 'seed the base sensors',
        author: BROWSER_USER,
        features: Array.from({ length: BASE_SENSOR_COUNT }, (_entry, index) =>
          sensorFeature(index),
        ),
      }),
    });
    expect(imported.status, JSON.stringify(imported.json)).toBe(200);
    expect(imported.json.imported).toBe(BASE_SENSOR_COUNT);

    const scenarioName = 'more sensors';
    const scenario = await ptolemy(`/datasets/${dataset.json.id}/branches`, token, {
      method: 'POST',
      body: JSON.stringify({
        name: scenarioName,
        created_by: BROWSER_USER,
        fork_from_branch: base.json.id,
      }),
    });
    expect(scenario.status, JSON.stringify(scenario.json)).toBe(201);

    const added = await ptolemy(`/branches/${scenario.json.id}/import/geojson`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: 'add one sensor to the scenario',
        author: BROWSER_USER,
        features: [extraSensorFeature()],
      }),
    });
    expect(added.status, JSON.stringify(added.json)).toBe(200);

    const baseLayer = `agent-layer-ptolemy-branch-${base.json.id}`;
    const scenarioLayer = `agent-layer-ptolemy-branch-${scenario.json.id}`;

    await page.addInitScript((session) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(session));
      localStorage.setItem(
        'viewtopia-app',
        JSON.stringify({ state: { renderer: 'maplibre' }, version: 0 }),
      );
    }, { user: { name: BROWSER_USER }, token });
    await page.goto('/');
    await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });

    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Scenario' }).first().click();

    await page.getByTestId('scenario-dataset').click();
    await page.getByRole('option', { name: datasetName }).click();
    await expect(page.getByTestId('scenario-base')).toHaveValue('main');

    await page.getByTestId('scenario-branch').click();
    await page.getByRole('option', { name: scenarioName }).click();

    await page.getByTestId('scenario-distance').fill(String(COVERAGE_DISTANCE_METERS));
    await page.getByTestId('scenario-compare').click();

    await expect(page.getByTestId('scenario-base-coverage')).toBeVisible();
    await expect(page.getByTestId('scenario-base-coverage')).toContainText(
      `${BASE_SENSOR_COUNT} features`,
    );
    await expect(page.getByTestId('scenario-branch-coverage')).toContainText(
      `${BASE_SENSOR_COUNT + 1} features`,
    );

    // the second pane only exists once the compare turns the split on
    await page.waitForFunction(
      (index) => !!window.__viewtopiaPaneMaps?.[index],
      COMPARE_PANE,
      { timeout: 60_000 },
    );

    await expect
      .poll(() => sourcesOf(page, VIEWER_PANE), { timeout: 30_000 })
      .toContain(baseLayer);
    expect(await sourcesOf(page, VIEWER_PANE)).not.toContain(scenarioLayer);

    await expect
      .poll(() => sourcesOf(page, COMPARE_PANE), { timeout: 30_000 })
      .toContain(scenarioLayer);
    expect(await sourcesOf(page, COMPARE_PANE)).not.toContain(baseLayer);

    const baseArea = coverageSquareMeters(
      await page.getByTestId('scenario-base-coverage').innerText(),
    );
    const scenarioArea = coverageSquareMeters(
      await page.getByTestId('scenario-branch-coverage').innerText(),
    );
    expect(baseArea).toBeGreaterThan(0);
    expect(scenarioArea).toBeGreaterThan(baseArea);
    await expect(page.getByTestId('scenario-difference')).toContainText('+');

    await page.getByTestId('scenario-stop').click();

    await expect
      .poll(() => sourcesOf(page, VIEWER_PANE), { timeout: 30_000 })
      .not.toContain(baseLayer);
    expect(await sourcesOf(page, VIEWER_PANE)).not.toContain(scenarioLayer);
    expect(await page.evaluate(() => Object.keys(window.__viewtopiaPaneMaps ?? {}))).toEqual([]);
  });
});
