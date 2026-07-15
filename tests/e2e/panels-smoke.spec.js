import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the six tool panels wired to real functionality:
 * Shadows, Lighting, Global Terrain (Cesium scene) + Heatmap, Spatial Stats
 * (deck.gl aggregation) + Cross Section (elevation profile).
 *
 * Served standalone on :5175 (see playwright.react.config.js). deck.gl gets a
 * real WebGL canvas headless; the Cesium viewer may be absent headless, so the
 * Cesium panels assert the live scene property when a viewer exists and the
 * no-viewer status otherwise (both are real outputs of the panel's apply path).
 *
 * Run: npm run test:e2e:react
 */

const REACT_URL = '/';

const SAMPLE_POINTS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: { value: 10 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.12, 51.51] }, properties: { value: 20 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.09, 51.49] }, properties: { value: 30 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.11, 51.505] }, properties: { value: 5 } },
  ],
});

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
    await page.getByText('🌑 Shadows').click();
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
    await page.getByText('☀ Lighting').click();
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
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByText('⛰ Terrain').click();
    await expect(page.getByText('Global Terrain')).toBeVisible();

    await page.getByRole('button', { name: 'Enable Terrain' }).click();
    // Either the provider resolves/fails (Ion token dependent) or there's no viewer.
    await expect(page.getByTestId('terrain-status')).toHaveText(
      /enabled|Terrain failed|No active viewer/,
      { timeout: 15000 },
    );

    await page.getByRole('button', { name: 'Reset to Ellipsoid' }).click();
    const v = await readViewer(page, "v.terrainProvider.constructor.name");
    if (v.present) {
      expect(v.value).toBe('EllipsoidTerrainProvider');
      await expect(page.getByTestId('terrain-status')).toHaveText('Ellipsoid (default)');
    } else {
      await expect(page.getByTestId('terrain-status')).toHaveText('No active viewer');
    }
  });

  test('heatmap: adds a deck.gl layer from pasted GeoJSON', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('🔥 Heatmap').click();
    await expect(page.getByText('Heatmap Layer')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Real effects: status reflects the parsed point count and the deck renderer mounts.
    await expect(page.getByTestId('heatmap-status')).toHaveText('Heatmap added: 4 points');
    await expect(page.locator('#deckgl-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('spatial stats: aggregates pasted points into a deck.gl grid', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('📊 Statistics').click();
    await expect(page.getByText('Spatial Statistics')).toBeVisible();

    await page.getByRole('textbox', { name: 'GeoJSON' }).fill(SAMPLE_POINTS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    await expect(page.getByTestId('spatialstats-result')).toContainText('points: 4');
    await expect(page.locator('#deckgl-container canvas').first()).toBeVisible({ timeout: 10000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('cross section: samples a two-point line into an elevation profile', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Analysis' }).click();
    await page.getByText('📐 Section').click();
    await expect(page.getByText('Cross Section')).toBeVisible();

    await page.getByRole('button', { name: 'Generate Profile' }).click();
    // The DEM fetch falls back to synthetic data, so a chart + stats always render.
    await expect(page.locator('svg[aria-label="elevation profile"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('crosssection-stats')).toBeVisible();
    await expect(page.getByTestId('crosssection-stats')).toContainText('Distance:');
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
    await page.getByLabel('Annotate').click();
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
    await page.getByLabel('Bookmarks').click();
    await expect(page.getByPlaceholder('Bookmark name…')).toBeVisible();

    await page.getByPlaceholder('Bookmark name…').fill('Home View');
    await page.getByLabel('Save bookmark').click();

    await expect(page.getByText('Home View')).toBeVisible();
    await expect(page.getByTestId('bookmark-status')).toContainText('Saved');
  });

  test('share link: generate encodes camera + renderer into the hash', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByText('🔗 Share Link').click();
    await expect(page.getByText('Share Link', { exact: true })).toBeVisible();

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
    await expect(page.getByRole('textbox', { name: 'Renderer' })).toHaveValue('MapLibre');
    // renderer actually switched: the MapLibre canvas mounts
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('stories: add step then toggle play mode', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByText('📖 Stories').click();
    await expect(page.getByText('Stories', { exact: true })).toBeVisible();

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
    await page.getByText('♿ A11y').click();
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
    await page.getByText('🗺 Tracks').click();
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

  test('vector tiles: adds an MVT source+layer to the live MapLibre map', async ({ page }) => {
    await page.goto(REACT_URL);
    // switch to MapLibre and wait for the map to render
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => window.__viewtopiaMap && window.__viewtopiaMap.isStyleLoaded(), null, { timeout: 15000 });

    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByText('🔷 Vector Tiles').click();
    await expect(page.getByText('Vector Tiles', { exact: true })).toBeVisible();

    await page.getByPlaceholder('Source name').fill('Parcels');
    await page.getByPlaceholder('/api/v1/branches/{id}/tiles/{z}/{x}/{y}').fill('https://example.com/{z}/{x}/{y}.pbf');
    await page.getByRole('button', { name: 'Add Source' }).click();

    await expect(page.getByTestId('vt-status')).toContainText('Added Parcels');
    const hasSource = await page.evaluate(() =>
      Object.keys(window.__viewtopiaMap.getStyle().sources).some((k) => k.startsWith('vt-')),
    );
    expect(hasSource).toBe(true);
  });
});
