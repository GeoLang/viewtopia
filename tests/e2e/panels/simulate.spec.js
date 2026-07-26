import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers';
import { mintToken } from '../../../scripts/platform-token.mjs';

/**
 * Functional smoke for the Simulate menu: every panel runs its primary action
 * and the assertion reads the effect back out of the live renderer or backend
 * response, so a panel that stops doing its work fails here.
 *
 * Weather, Wind and Traffic call third-party APIs (open-meteo, overpass), which
 * are stubbed per-request; everything else runs against the platform stack.
 * Flood and Solar POST to tiletopia, so the session token is seeded first.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/simulate.spec.js
 */

/** Small land area with real relief, so flood and solar have terrain to work on. */
const MONACO = { west: 7.4, south: 43.72, east: 7.45, north: 43.75 };

const TOKEN = mintToken({ role: 'editor', sub: 'panels-simulate-e2e' });

/**
 * Way ids and geometry for the Overpass stub. TrafficPanel hashes id and hour of
 * day into a congestion value, so the ids are chosen to keep the three values at
 * least 0.06 apart at every hour, and the two sets at least 0.01 apart from each
 * other, whatever hour the run lands on. Picking them at random risks a hash
 * collision that reads as a real failure.
 */
const WAYS_A = [142, 234, 261];
const WAYS_B = [300, 305, 440];
const WAY_GEOMETRY = [
  [{ lat: 43.73, lon: 7.42 }, { lat: 43.74, lon: 7.43 }],
  [{ lat: 43.735, lon: 7.415 }, { lat: 43.745, lon: 7.425 }],
  [{ lat: 43.725, lon: 7.405 }, { lat: 43.73, lon: 7.41 }],
];
const WAY_COORDINATES = WAY_GEOMETRY.map((way) => way.map((p) => [p.lon, p.lat]));

/** Seed the persisted session so the tiletopia analysis POSTs are authorised. */
async function seedAuth(page) {
  await page.addInitScript((token) => {
    if (token) {
      localStorage.setItem(
        'viewtopia_auth',
        JSON.stringify({ user: { email: 'simulate-e2e@viewtopia.test' }, token }),
      );
    }
  }, TOKEN);
}

async function openPanel(page, label, title) {
  await page.getByRole('button', { name: 'Simulate' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  const panel = page.locator(PANEL).filter({ hasText: title });
  await expect(panel).toHaveCount(1);
  return panel;
}

async function closePanel(page, panel) {
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

/** Point the Cesium camera at a lon/lat box, so the panels read a small bbox. */
async function viewBox(page, box) {
  await page.evaluate((b) => {
    const rad = (d) => (d * Math.PI) / 180;
    window.__viewtopiaViewer.camera.setView({
      destination: { west: rad(b.west), south: rad(b.south), east: rad(b.east), north: rad(b.north) },
    });
  }, box);
  const span = await page.evaluate(() => {
    const rect = window.__viewtopiaViewer.camera.computeViewRectangle();
    return ((rect.east - rect.west) * 180) / Math.PI;
  });
  expect(span).toBeLessThan(1);
}

/**
 * Drag-free way to move a Mantine slider: click its track at a fraction of the
 * width. The click stays 2px inside the track, because the very edge lands on
 * the panel behind it. The resulting value is whatever the panel's own label
 * reports, so callers read it back instead of assuming one.
 */
async function setSlider(panel, fraction) {
  const track = panel.locator('[class*="mantine-Slider-root"]').first();
  const box = await track.boundingBox();
  const x = Math.min(box.width - 2, Math.max(2, box.width * fraction));
  await track.click({ position: { x, y: box.height / 2 } });
}

/** First integer in a live element's text, or -1 while the element is gone. */
async function readInt(locator) {
  const text = await locator.textContent().catch(() => null);
  return text ? firstInt(text) : -1;
}

/** deck.gl layers currently pushed into the live Deck, by id prefix. */
function deckLayers(page, prefix) {
  return page.evaluate((p) => {
    const layers = window.__viewtopiaDeck?.props?.layers ?? [];
    return layers
      .filter((l) => l.id.startsWith(p))
      .map((l) => ({ id: l.id, count: l.props.data.length, first: l.props.data[0] }));
  }, prefix);
}

/**
 * The flood result layer in the live Cesium viewer, or null while it is absent.
 * tiletopia answers with one MultiPolygon member per flooded cell, so the entity
 * count is the drawn cell count and can be checked against the panel's readout.
 */
function floodPolygons(page) {
  return page.evaluate(() => {
    const all = window.__viewtopiaViewer.dataSources;
    for (let i = 0; i < all.length; i++) {
      const ds = all.get(i);
      if (ds.name !== 'flood-result') continue;
      const entities = ds.entities.values;
      const positions = entities.reduce(
        (n, e) => n + (e.polygon?.hierarchy?.getValue()?.positions.length ?? 0),
        0,
      );
      return { polygons: entities.length, positions };
    }
    return null;
  });
}

const viewerProp = (page, read) => page.evaluate(read);

const firstInt = (text) => Number(/\d+/.exec(text)[0]);

/**
 * open-meteo stub: a single-coordinate request answers with an object, the
 * batched grid request (comma-joined coords) with one entry per coordinate.
 * Values are fixed so the panels' readouts are exact.
 */
async function mockOpenMeteo(page) {
  await page.route(/open-meteo\.com/, (route) => {
    const url = new URL(route.request().url());
    const lats = (url.searchParams.get('latitude') || '').split(',');
    if (lats.length > 1) {
      const body = lats.map((_, i) => ({
        current: {
          temperature_2m: 15 + (i % 5),
          precipitation: (i % 3) * 0.5,
          wind_speed_10m: 8 + (i % 7) * 4,
          wind_direction_10m: (i * 37) % 360,
        },
      }));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    const times = Array.from({ length: 24 }, (_, h) => `2026-07-15T${String(h).padStart(2, '0')}:00`);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        current: {
          temperature_2m: 21.4,
          relative_humidity_2m: 55,
          precipitation: 0.2,
          weather_code: 2,
          cloud_cover: 40,
          wind_speed_10m: 12,
          wind_direction_10m: 210,
        },
        hourly: {
          time: times,
          temperature_2m: times.map((_, h) => 15 + Math.sin(h / 3) * 5),
          precipitation: times.map((_, h) => (h % 6 === 0 ? 0.4 : 0)),
        },
      }),
    });
  });
}

test.describe('Simulate panels', () => {
  test.describe.configure({ mode: 'parallel' });

  test('weather: grid overlay samples the view into deck.gl cells', async ({ page }) => {
    await mockOpenMeteo(page);
    await openApp(page);
    const panel = await openPanel(page, 'Weather', 'Weather');

    await expect(panel.getByTestId('weather-current')).toContainText('21.4°C');
    await expect(panel.getByTestId('weather-current')).toContainText('Partly cloudy');
    await expect(panel.getByTestId('weather-sparkline')).toBeVisible();
    expect(await deckLayers(page, 'weather-grid')).toEqual([]);

    await panel.getByText('Grid overlay').click();

    await expect(panel.getByTestId('weather-grid-status')).toHaveText('25 cells');
    await expect.poll(async () => (await deckLayers(page, 'weather-grid')).length).toBe(1);
    const [grid] = await deckLayers(page, 'weather-grid');
    expect(grid.count).toBe(25);
    expect(grid.first.temperature).toBe(15);

    await closePanel(page, panel);
  });

  test('wind: scaling the arrows rescales the rendered wind field', async ({ page }) => {
    await mockOpenMeteo(page);
    await openApp(page);
    const panel = await openPanel(page, 'Wind', 'Wind Field');

    await expect(panel.getByTestId('wind-status')).toHaveText('64 arrows, peak 32 km/h');
    await expect.poll(async () => (await deckLayers(page, 'wind-shaft')).length).toBe(1);
    const [before] = await deckLayers(page, 'wind-shaft');
    expect(before.count).toBe(64);
    const lengthOf = (a) => Math.hypot(a.target[0] - a.source[0], a.target[1] - a.source[1]);
    expect(lengthOf(before.first)).toBeGreaterThan(0);

    const scaleLabel = panel.getByText(/Arrow scale:/);
    await setSlider(panel, 0.95);
    await expect(scaleLabel).not.toHaveText('Arrow scale: 1.0x');
    const scale = Number(/([\d.]+)x/.exec(await scaleLabel.textContent())[1]);
    expect(scale).toBeGreaterThan(1);

    const [after] = await deckLayers(page, 'wind-shaft');
    expect(after.count).toBe(64);
    expect(lengthOf(after.first) / lengthOf(before.first)).toBeCloseTo(scale, 1);

    await closePanel(page, panel);
  });

  test('lighting: the switch and hour slider drive the live Cesium scene', async ({ page }) => {
    await openApp(page);
    const panel = await openPanel(page, 'Lighting', 'Day Lighting');

    await expect(panel.getByTestId('lighting-status')).toHaveText('lighting off (sun)');
    expect(await viewerProp(page, () => window.__viewtopiaViewer.scene.globe.enableLighting)).toBe(
      false,
    );
    // SunLight carries no direction; DirectionalLight does
    expect(await viewerProp(page, () => !!window.__viewtopiaViewer.scene.light.direction)).toBe(
      false,
    );

    await panel.getByText('Enable Sun Simulation').click();

    await expect(panel.getByTestId('lighting-status')).toHaveText('lighting on (sun)');
    expect(await viewerProp(page, () => window.__viewtopiaViewer.scene.globe.enableLighting)).toBe(
      true,
    );

    await panel.getByRole('textbox', { name: 'Light Source' }).click();
    await page.getByRole('option', { name: 'Directional' }).click();

    await expect(panel.getByTestId('lighting-status')).toHaveText('lighting on (directional)');
    expect(await viewerProp(page, () => !!window.__viewtopiaViewer.scene.light.direction)).toBe(
      true,
    );

    // the hour slider retimes the scene clock
    const clockAt = () =>
      viewerProp(page, () => window.__viewtopiaViewer.clock.currentTime.secondsOfDay);
    const noon = await clockAt();
    await panel.getByRole('slider').press('ArrowRight');
    await expect(panel.getByText('Time of Day: 12:15')).toBeVisible();
    expect((await clockAt()) - noon).toBeCloseTo(900, 0);

    await closePanel(page, panel);
  });

  test('flood: simulating adds a flooded-area layer and more cells at a higher level', async ({
    page,
  }) => {
    await seedAuth(page);
    await openApp(page);
    await viewBox(page, MONACO);
    const panel = await openPanel(page, 'Flood', 'Flood Simulation');

    const dataSources = () => viewerProp(page, () => window.__viewtopiaViewer.dataSources.length);
    const before = await dataSources();
    const cells = panel.getByText(/flooded cell/);
    expect(await floodPolygons(page)).toBeNull();

    await panel.getByRole('button', { name: 'Simulate' }).click();
    await expect(cells).toBeVisible({ timeout: 60000 });
    const low = firstInt(await cells.textContent());
    expect(low).toBeGreaterThan(0);
    // the polygon is added right after the count renders
    await expect.poll(dataSources).toBe(before + 1);
    await expect.poll(() => floodPolygons(page).then((l) => l?.polygons ?? -1)).toBe(low);
    expect((await floodPolygons(page)).positions).toBeGreaterThan(0);

    // a deeper flood covers more of the same terrain
    const levelLabel = panel.getByText(/Water Level:/);
    await setSlider(panel, 0.95);
    await expect(levelLabel).not.toHaveText('Water Level: 20m');
    expect(await readInt(levelLabel)).toBeGreaterThan(40);

    await panel.getByRole('button', { name: 'Simulate' }).click();
    await expect.poll(() => readInt(cells), { timeout: 60000 }).toBeGreaterThan(low);
    const high = await readInt(cells);
    // the drawn polygon count follows the new count, so a stale layer left from
    // the first run fails here; the data source count catches a leaked one
    await expect
      .poll(() => floodPolygons(page).then((l) => l?.polygons ?? -1), { timeout: 60000 })
      .toBe(high);
    await expect.poll(dataSources).toBe(before + 1);

    await closePanel(page, panel);
  });

  test('solar: computing drapes an irradiance raster the opacity slider controls', async ({
    page,
  }) => {
    await seedAuth(page);
    await openApp(page);
    await viewBox(page, MONACO);
    const panel = await openPanel(page, 'Solar', 'Solar Planner');

    const imagery = () => viewerProp(page, () => window.__viewtopiaViewer.imageryLayers.length);
    const topAlpha = () =>
      viewerProp(page, () => {
        const layers = window.__viewtopiaViewer.imageryLayers;
        return layers.get(layers.length - 1).alpha;
      });
    const before = await imagery();

    await panel.getByRole('button', { name: 'Compute' }).click();

    await expect.poll(imagery, { timeout: 60000 }).toBe(before + 1);
    await expect(panel.getByText('Solar request failed')).toHaveCount(0);
    expect(await topAlpha()).toBeCloseTo(0.7, 2);

    const opacityLabel = panel.getByText(/Opacity:/);
    await setSlider(panel, 0.05);
    await expect(opacityLabel).not.toHaveText('Opacity: 70%');
    const percent = await readInt(opacityLabel);
    expect(percent).toBeLessThan(70);
    expect(await topAlpha()).toBeCloseTo(percent / 100, 2);

    await closePanel(page, panel);
  });

  test('traffic: demo mode colours OSM roads on the live MapLibre map', async ({ page }) => {
    let ways = WAYS_A;
    await page.route(/overpass-api\.de/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          elements: ways.map((id, i) => ({ type: 'way', id, geometry: WAY_GEOMETRY[i] })),
        }),
      }),
    );
    await openApp(page);

    // the panel draws on MapLibre, so switch renderer and wait for its style
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, {
      timeout: 30000,
    });

    const panel = await openPanel(page, 'Traffic', 'Traffic');
    const roads = () =>
      page.evaluate(() => {
        const map = window.__viewtopiaMap;
        const source = map.getSource('traffic-demo');
        if (!source) return null;
        const data = source.serialize().data;
        return {
          count: data.features.length,
          coordinates: data.features.map((f) => f.geometry.coordinates),
          colors: data.features.map((f) => f.properties.color),
          congestion: data.features.map((f) => f.properties.congestion),
          paint: map.getLayer('traffic-demo-line')
            ? map.getPaintProperty('traffic-demo-line', 'line-color')
            : null,
        };
      });
    const congestionOf = async () => ((await roads())?.congestion ?? []).join('|');
    expect(await roads()).toBeNull();

    await panel.getByRole('button', { name: 'Load demo traffic' }).click();

    await expect(panel.getByTestId('traffic-status')).toContainText('3 roads');
    const after = await roads();
    expect(after.count).toBe(3);
    expect(after.paint).toEqual(['get', 'color']);
    // the drawn lines are the stubbed Overpass geometry, lon/lat per node
    expect(after.coordinates).toEqual(WAY_COORDINATES);
    expect(after.colors.every((c) => /^rgb\(\d+,\d+,\d+\)$/.test(c))).toBe(true);
    expect(new Set(after.congestion).size).toBe(3);
    for (const c of after.congestion) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
    }

    // congestion is hashed from the way id, so the same roads under new ids must
    // recolour: a panel painting a fixed pattern instead fails here
    ways = WAYS_B;
    await panel.getByRole('button', { name: 'Load demo traffic' }).click();
    await expect.poll(congestionOf).not.toBe(after.congestion.join('|'));

    const reloaded = await roads();
    expect(reloaded.count).toBe(3);
    expect(reloaded.coordinates).toEqual(WAY_COORDINATES);
    expect(new Set(reloaded.congestion).size).toBe(3);
    expect(reloaded.colors).not.toEqual(after.colors);

    await closePanel(page, panel);
  });
});
