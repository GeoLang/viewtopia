import { allowConsoleError, test, expect } from './console-guard';
import { MENU_ITEM } from './panel-helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E smoke for the six tool panels wired to real functionality:
 * Shadows, Lighting, Global Terrain (Cesium scene) + Heatmap (native maplibre
 * layer), Spatial Stats (deck.gl aggregation) + Cross Section (elevation profile).
 *
 * Served standalone on :5175 (see playwright.react.config.js). MapLibre (which
 * hosts the deck.gl layers) gets a real WebGL canvas headless; the Cesium viewer
 * may be absent headless, so the
 * Cesium panels assert the live scene property when a viewer exists and the
 * no-viewer status otherwise (both are real outputs of the panel's apply path).
 *
 * Run: npm run test:e2e:react
 */

const REACT_URL = '/';

// the vector style is a public CDN fetch, so this wait rides on the network and
// not just the renderer. the maplibre specs budget the same.
const STYLE_LOAD_TIMEOUT = 60000;

// the Cesium panels here read the live Cesium scene; the shipped default
// renderer is MapLibre, so seed the persisted one
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { renderer: 'cesium' }, version: 0 }),
    );
  });
});

const SAMPLE_POINTS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: { value: 10 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.12, 51.51] }, properties: { value: 20 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.09, 51.49] }, properties: { value: 30 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.11, 51.505] }, properties: { value: 5 } },
  ],
});

/** Quantized-mesh terrain metadata with an empty availability list. */
const LAYER_JSON = {
  tilejson: '2.1.0',
  format: 'quantized-mesh-1.0',
  version: '1.0.0',
  scheme: 'tms',
  tiles: ['{z}/{x}/{y}.terrain?v={version}'],
  projection: 'EPSG:4326',
  bounds: [-180, -90, 180, 90],
  available: [],
};

/**
 * Cross Section reads its DEM from the public Open-Elevation API, so serve one
 * instead: a 7 m climb per sample with one deep notch in the middle. Nothing
 * about those numbers resembles the Thames valley the line actually crosses, so
 * a profile carrying them can only have come from this response.
 */
const CROSS_SECTION_SAMPLES = 50;
const NOTCH_SAMPLE = 25;
const sampleElevation = (index) => (index === NOTCH_SAMPLE ? 500 : 1000 + index * 7);

async function mockOpenElevation(page) {
  await page.route('https://api.open-elevation.com/**', (route) => {
    const locations = new URL(route.request().url()).searchParams.get('locations') ?? '';
    const results = locations.split('|').map((_, i) => ({ elevation: sampleElevation(i) }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results }) });
  });
}

/** Read the live Cesium viewer handle exposed by the renderer registry, if any. */
async function readViewer(page, expr) {
  return page.evaluate((e) => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed?.()) return { present: false };
    // eslint-disable-next-line no-new-func
    return { present: true, value: new Function('v', `return (${e})`)(v) };
  }, expr);
}

test.describe('tool panels', () => {
  test('shadows: enabling drives the live scene or reports no viewer', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Shadows' }).click();
    await expect(page.getByText('Shadow Analysis')).toBeVisible();

    await page.getByText('Enable Shadows').click();
    await expect(page.getByLabel('Enable Shadows')).toBeChecked();

    const v = await readViewer(page, 'v.shadows');
    if (v.present) {
      expect(v.value).toBe(true);
      await expect(page.getByTestId('shadows-status')).toContainText('shadows on');
    } else {
      await expect(page.getByTestId('shadows-status')).toHaveText('No active viewer');
    }
  });

  test('lighting: enabling toggles globe lighting on the live scene', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('menuitem', { name: 'Lighting' }).click();
    await expect(page.getByText('Day Lighting')).toBeVisible();

    await page.getByText('Enable Sun Simulation').click();
    await expect(page.getByLabel('Enable Sun Simulation')).toBeChecked();

    const v = await readViewer(page, 'v.scene.globe.enableLighting');
    if (v.present) {
      expect(v.value).toBe(true);
      await expect(page.getByTestId('lighting-status')).toContainText('lighting on');
    } else {
      await expect(page.getByTestId('lighting-status')).toHaveText('No active viewer');
    }
  });

  test('global terrain: enable runs the provider path and reset returns ellipsoid', async ({ page }) => {
    // Cesium World Terrain needs an Ion token the stack does not have, so the
    // enable path runs against a mocked custom endpoint instead: a real layer.json
    // with no tiles in it, which builds a real CesiumTerrainProvider and then
    // fetches nothing.
    await page.route('https://terrain.test/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(LAYER_JSON) }),
    );
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByRole('menuitem', { name: 'Terrain' }).click();
    await expect(page.getByText('Global Terrain')).toBeVisible();

    // The viewer boots on the flat ellipsoid provider. Comparing against that
    // class is minification-safe, unlike reading constructor.name, which is one
    // or two letters in the production bundle.
    await page.evaluate(() => {
      window.__bootTerrainClass = window.__viewtopiaViewer?.terrainProvider?.constructor;
    });

    await page.getByRole('textbox', { name: 'Provider' }).click();
    await page.getByRole('option', { name: 'Custom URL' }).click();
    await page.getByRole('textbox', { name: 'Terrain URL' }).fill('https://terrain.test/');
    await page.getByRole('button', { name: 'Enable Terrain' }).click();
    await expect(page.getByTestId('terrain-status')).toHaveText(
      /Custom terrain enabled|No active viewer/,
      { timeout: 15000 },
    );

    const enabled = await readViewer(
      page,
      'v.terrainProvider.constructor !== window.__bootTerrainClass',
    );
    if (enabled.present) expect(enabled.value).toBe(true);

    await page.getByRole('button', { name: 'Reset to Ellipsoid' }).click();
    const reset = await readViewer(
      page,
      'v.terrainProvider.constructor === window.__bootTerrainClass',
    );
    if (reset.present) {
      expect(reset.value).toBe(true);
      await expect(page.getByTestId('terrain-status')).toHaveText('Ellipsoid (default)');
    } else {
      await expect(page.getByTestId('terrain-status')).toHaveText('No active viewer');
    }
  });

  test('heatmap: adds a native maplibre heatmap layer from pasted GeoJSON', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Heatmap' }).click();
    await expect(page.getByText('Heatmap Layer')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Real effects: status reflects the parsed point count, and the layer lands on
    // the live map's style (deck's screen-space heatmap draws nothing on a globe).
    await expect(page.getByTestId('heatmap-status')).toHaveText('Heatmap added: 4 points');
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 10000 });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window.__viewtopiaMap?.getStyle()?.layers ?? [])
              .filter((l) => l.type === 'heatmap')
              .map((l) => l.id),
          ),
        { timeout: 30000 },
      )
      .toEqual(['native-heatmap-panel-heatmap']);
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('spatial stats: aggregates pasted points into a deck.gl grid', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Statistics' }).click();
    await expect(page.getByText('Spatial Statistics')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    await expect(page.getByTestId('spatialstats-result')).toContainText('points: 4');
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('cross section: samples a two-point line into an elevation profile', async ({ page }) => {
    await mockOpenElevation(page);
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Section' }).click();
    await expect(page.getByText('Cross Section')).toBeVisible();

    await page.getByLabel('Sample Points').fill(String(CROSS_SECTION_SAMPLES));
    await page.getByRole('button', { name: 'Generate Profile' }).click();

    // 51 samples off the DEM above: 1000 m climbing by 7, dropping to 500 at the
    // notch and climbing back. Distance is the real line from 51.5,-0.1.
    const stats = page.getByTestId('crosssection-stats');
    await expect(stats).toContainText(/Min Elev:\s+500 m/, { timeout: 15000 });
    await expect(stats).toContainText(/Max Elev:\s+1350 m/);
    await expect(stats).toContainText(/Gain:\s+\+1018 m/);
    await expect(stats).toContainText(/Loss:\s+-668 m/);
    await expect(stats).toContainText(/Distance:\s+11\.64 km/);

    // and the chart plots those same numbers. The chart normalises y against the
    // profile's own min and max, so rescaling the drawn ys back to 0..1 has to
    // reproduce the served DEM rescaled the same way, whatever size it drew at.
    const line = page.locator('svg[aria-label="elevation profile"] path[fill="none"]');
    await expect(line).toBeVisible();
    const ys = (await line.getAttribute('d')).split(' ').map((cmd) => Number(cmd.split(',')[1]));
    expect(ys).toHaveLength(CROSS_SECTION_SAMPLES + 1);

    const bottom = Math.max(...ys);
    const top = Math.min(...ys);
    const drawn = ys.map((y) => ((bottom - y) / (bottom - top)).toFixed(4));
    const served = Array.from({ length: CROSS_SECTION_SAMPLES + 1 }, (_, i) => sampleElevation(i));
    const lowest = Math.min(...served);
    const span = Math.max(...served) - lowest;
    expect(drawn).toEqual(served.map((e) => ((e - lowest) / span).toFixed(4)));
  });

  test('cross section: a failed elevation lookup is shown and plots nothing', async ({ page }) => {
    // open-elevation is a free public service that answers 5xx when it is loaded
    let answer = 'unavailable';
    await page.route('https://api.open-elevation.com/**', (route) =>
      answer === 'unavailable'
        ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' })
        : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );
    allowConsoleError(page, /Failed to load resource.*503.*api\.open-elevation\.com/);

    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Section' }).click();
    await expect(page.getByText('Cross Section')).toBeVisible();

    await page.getByRole('button', { name: 'Generate Profile' }).click();

    await expect(page.getByText('elevation lookup failed: 503')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('svg[aria-label="elevation profile"]')).toHaveCount(0);
    await expect(page.getByTestId('crosssection-stats')).toHaveCount(0);

    // a 200 carrying nothing usable is the lookup's other failure, and it has to
    // reach the same surface rather than plot whatever the response parsed to
    answer = 'nonsense';
    await page.getByRole('button', { name: 'Generate Profile' }).click();

    await expect(page.getByText('elevation lookup returned no usable data')).toBeVisible();
    await expect(page.locator('svg[aria-label="elevation profile"]')).toHaveCount(0);
    await expect(page.getByTestId('crosssection-stats')).toHaveCount(0);
  });
});

const SAMPLE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg>` +
  `<trkpt lat="51.50" lon="-0.10"><ele>10</ele></trkpt>` +
  `<trkpt lat="51.51" lon="-0.12"><ele>12</ele></trkpt>` +
  `<trkpt lat="51.49" lon="-0.09"><ele>8</ele></trkpt>` +
  `</trkseg></trk></gpx>`;

test.describe('local tool panels (batch 2)', () => {
  test('annotate: add at center appends an annotation and a live entity', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Annotate' }).first().click();
    await expect(page.getByText('Annotations')).toBeVisible();

    await page.getByPlaceholder('Annotation label…').fill('Site A');
    await page.getByRole('button', { name: 'Add at center' }).click();

    await expect(page.getByTestId('annotate-count')).toHaveText('1');
    await expect(page.getByText('Site A')).toBeVisible();

    const v = await readViewer(page, "v.entities.values.filter(e => e.id.indexOf('annot-') === 0).length");
    if (v.present) expect(v.value).toBe(1);
  });

  test('bookmark: saving captures a named view into the list', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.locator(MENU_ITEM).filter({ hasText: 'Bookmarks' }).first().click();
    await expect(page.getByPlaceholder('Bookmark name…')).toBeVisible();

    await page.getByPlaceholder('Bookmark name…').fill('Home View');
    await page.getByLabel('Save bookmark').click();

    await expect(page.getByText('Home View')).toBeVisible();
    await expect(page.getByTestId('bookmark-status')).toContainText('Saved');
  });

  test('share link: generate encodes camera + renderer into the hash', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Share Link' }).click();
    await expect(page.locator('.panel-dock').getByText('Share Link', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Generate Share Link' }).click();
    const url = await page.getByTestId('sharelink-url').inputValue();
    expect(url).toContain('#cam=');
    expect(url).toContain('renderer=');
    // cam carries five comma-separated numbers (lng,lat,height,heading,pitch)
    const cam = new URL(url).hash.replace(/^#/, '');
    const camParam = new URLSearchParams(cam).get('cam');
    expect(camParam.split(',').length).toBe(5);
  });

  test('share link: hash on load applies the encoded renderer', async ({ page }) => {
    await page.goto('/#cam=10,20,1000000,0,-30&renderer=maplibre');
    await page.getByRole('button', { name: 'Basemap & renderer' }).click();
    await expect(page.getByRole('textbox', { name: 'Renderer' })).toHaveValue('MapLibre');
    // renderer actually switched: the MapLibre canvas mounts
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('stories: add step then toggle play mode', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: 'Stories' }).click();
    await expect(page.locator('.panel-dock').getByText('Stories', { exact: true })).toBeVisible();

    await page.getByPlaceholder('Step title…').fill('Intro');
    await page.getByRole('button', { name: 'Add step at view' }).click();

    await expect(page.getByTestId('stories-count')).toHaveText('1 steps');
    await expect(page.getByText('1. Intro')).toBeVisible();

    await page.getByTestId('stories-play').click();
    await expect(page.getByTestId('stories-play')).toContainText('Stop Story');
    await page.getByTestId('stories-play').click();
    await expect(page.getByTestId('stories-play')).toContainText('Play Story');
  });

  test('accessibility: toggles set classes and root font-size on <html>', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('menuitem', { name: 'A11y' }).click();
    await expect(page.getByText('Accessibility')).toBeVisible();

    await page.getByText('High Contrast').click();
    await expect(page.locator('html')).toHaveClass(/a11y-high-contrast/);

    await page.getByText('Large Text').click();
    const fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(fontSize).toBe('20px');
  });

  test('track import: parses inline GPX into listed points', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByRole('menuitem', { name: 'Tracks' }).click();
    await expect(page.getByText('Track Import')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'walk.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(SAMPLE_GPX),
    });

    await expect(page.getByTestId('track-status')).toContainText('3 points');
    await expect(page.getByText('3 pts')).toBeVisible();

    const v = await readViewer(page, "v.entities.values.filter(e => e.id.indexOf('track-pt-') === 0).length");
    if (v.present) expect(v.value).toBe(3);
  });

  test('space-time: importing the sample CSV lists its entities', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Space-Time' }).click();

    const panel = page
      .locator('main > [class*="mantine-Paper-root"]')
      .filter({ hasText: 'Space-Time Intelligence' });
    await expect(panel).toBeVisible();

    await panel
      .locator('input[type="file"]')
      .setInputFiles(path.resolve(__dirname, '../fixtures/sample-tracks.csv'));

    await expect(panel.getByText('Imported 3 entities, 15 positions')).toBeVisible();
    await expect(panel.getByText('3 entities', { exact: true })).toBeVisible();
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      await expect(panel.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('space-time: cube view pitches the map and draws the sweep plane', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Basemap & renderer' }).click();
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, { timeout: STYLE_LOAD_TIMEOUT });

    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByRole('menuitem', { name: 'Space-Time' }).click();

    const panel = page
      .locator('main > [class*="mantine-Paper-root"]')
      .filter({ hasText: 'Space-Time Intelligence' });
    await panel
      .locator('input[type="file"]')
      .setInputFiles(path.resolve(__dirname, '../fixtures/sample-tracks.csv'));
    await expect(panel.getByText('Imported 3 entities, 15 positions')).toBeVisible();

    await panel.getByRole('button', { name: 'Toggle cube view' }).click();

    await page.waitForFunction(() => window.__viewtopiaMap.getPitch() > 55, null, { timeout: 10000 });
    await page.waitForFunction(
      () => window.__viewtopiaDeck?.props.layers.some((l) => l.id === 'spacetime-sweep-plane'),
      null,
      { timeout: 10000 },
    );
  });

  test('vector tiles: adds an MVT source+layer to the live MapLibre map', async ({ page }) => {
    // The tile host below does not exist. Serve an empty tile body (a valid
    // zero-field protobuf, i.e. a tile with no layers) so MapLibre walks its real
    // load path without a failed request.
    await page.route('https://tiles.test/**', (route) =>
      route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }),
    );
    await page.goto(REACT_URL);
    // switch to MapLibre and wait for the map to render
    await page.getByRole('button', { name: 'Basemap & renderer' }).click();
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => window.__viewtopiaMap && window.__viewtopiaMap.isStyleLoaded(), null, { timeout: STYLE_LOAD_TIMEOUT });

    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByRole('menuitem', { name: 'Vector Tiles' }).click();
    await expect(page.locator('.panel-dock').getByText('Vector Tiles', { exact: true })).toBeVisible();

    await page.getByPlaceholder('Source name').fill('Parcels');
    await page.getByPlaceholder('/api/v1/branches/{id}/tiles/{z}/{x}/{y}').fill('https://tiles.test/{z}/{x}/{y}.pbf');
    await page.getByRole('button', { name: 'Add Source' }).click();

    await expect(page.getByTestId('vt-status')).toContainText('Added Parcels');
    const hasSource = await page.evaluate(() =>
      Object.keys(window.__viewtopiaMap.getStyle().sources).some((k) => k.startsWith('vt-')),
    );
    expect(hasSource).toBe(true);
  });
});

/**
 * Weather, Wind, Traffic panels. These hit external free APIs (open-meteo,
 * overpass) so the network is mocked via page.route with deterministic
 * fixtures; the assertions check the observable render (SVG, deck.gl canvas,
 * MapLibre source), not the mock itself.
 */

// open-meteo: single-coordinate request returns an object, the batched grid
// request (comma-joined coords) returns an array, one entry per coordinate.
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

test.describe('weather/wind/traffic panels', () => {
  test('weather: shows current conditions, sparkline, and a grid overlay layer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockOpenMeteo(page);
    await page.goto(REACT_URL);

    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('menuitem', { name: 'Weather' }).click();
    await expect(page.locator('.panel-dock').getByText('Weather', { exact: true })).toBeVisible();

    await expect(page.getByTestId('weather-current')).toContainText('21.4°C');
    await expect(page.getByTestId('weather-sparkline')).toBeVisible();

    await page.getByText('Grid overlay').click();
    await expect(page.getByTestId('weather-grid-status')).toContainText('25 cells');
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('wind: samples a grid into a deck.gl arrow field with a legend', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockOpenMeteo(page);
    await page.goto(REACT_URL);

    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('menuitem', { name: 'Wind' }).click();
    await expect(page.getByText('Wind Field')).toBeVisible();

    await expect(page.getByTestId('wind-status')).toContainText('arrows');
    await expect(page.getByTestId('wind-legend')).toBeVisible();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('traffic: demo mode adds an OSM-roads source to the live MapLibre map', async ({ page }) => {
    await page.route(/overpass-api\.de/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          elements: [
            { type: 'way', id: 100, geometry: [{ lat: 51.5, lon: -0.1 }, { lat: 51.51, lon: -0.09 }] },
            { type: 'way', id: 101, geometry: [{ lat: 51.49, lon: -0.11 }, { lat: 51.5, lon: -0.1 }] },
          ],
        }),
      }),
    );
    await page.goto(REACT_URL);

    // traffic renders on MapLibre, so switch renderer and wait for the style
    await page.getByRole('button', { name: 'Basemap & renderer' }).click();
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => window.__viewtopiaMap && window.__viewtopiaMap.isStyleLoaded(), null, {
      timeout: STYLE_LOAD_TIMEOUT,
    });

    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('menuitem', { name: 'Traffic' }).click();
    await expect(page.locator('.panel-dock').getByText('Traffic', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Load demo traffic' }).click();
    await expect(page.getByTestId('traffic-status')).toContainText('demo data');
    const hasSource = await page.evaluate(() =>
      Boolean(window.__viewtopiaMap.getSource('traffic-demo')),
    );
    expect(hasSource).toBe(true);
  });
});
