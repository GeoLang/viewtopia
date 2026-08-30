import { test, expect } from './console-guard';

/**
 * The chat actions that move between the globe tab and the flat map tab, run
 * the way a tool result runs them and asserted on the live renderer.
 *
 * Every action goes through window.__viewtopiaRunAction, so no model and no
 * agent backend are involved.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-actions-tabs.spec.js
 */

const BOOT_TIMEOUT = 60_000;
const SETTLE_TIMEOUT = 30_000;
/** a vector basemap reaches loaded() in about a second, so this is generous */
const VECTOR_BASEMAP_TIMEOUT = 15_000;

const FRANCE = { lon: 2.2, lat: 46.6 };
const ROADS_URL = '/e2e-tabs-roads.geojson';
const ROADS_LAYER = 'e2e-tabs-roads.geojson';

const ROADS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [7.4, 46.9],
          [7.5, 47.0],
        ],
      },
      properties: { name: 'Bahnhofstrasse' },
    },
  ],
};

const runAction = (page, name, args) =>
  page.evaluate(([name, args]) => window.__viewtopiaRunAction({ name, args }), [name, args]);

const maplibreCentre = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaMap;
    if (!map) return null;
    const centre = map.getCenter();
    return { lat: centre.lat, lng: centre.lng };
  });

const leafletCentre = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaLeaflet;
    if (!map) return null;
    const centre = map.getCenter();
    return { lat: centre.lat, lng: centre.lng };
  });

const near = (centre, target) =>
  !!centre && Math.abs(centre.lat - target.lat) < 0.05 && Math.abs(centre.lng - target.lon) < 0.05;

/** The XYZ template the leaflet map is drawing tiles from. */
const leafletTileTemplate = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaLeaflet;
    if (!map) return null;
    let template = null;
    map.eachLayer((layer) => {
      if (layer._url) template = layer._url;
    });
    return template;
  });

/**
 * What the maplibre style is drawing the basemap from: the XYZ templates of a
 * raster basemap, and the glyph host of a vector one.
 */
const maplibreBasemapSource = (page) =>
  page.evaluate(() => {
    const style = window.__viewtopiaMap?.getStyle();
    if (!style) return null;
    return {
      tiles: Object.values(style.sources ?? {}).flatMap((source) => source.tiles ?? []),
      glyphs: style.glyphs ?? '',
    };
  });

const maplibreLayerIds = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaMap;
    if (!map) return [];
    return (map.getStyle()?.layers ?? [])
      .map((layer) => layer.id)
      .filter((id) => id.startsWith('agent-layer-'));
  });

/** Leaflet draws vector layers as SVG paths in its overlay pane. */
const leafletPathCount = (page) =>
  page.locator('#leaflet-container .leaflet-overlay-pane path').count();

const cesiumUp = (page) =>
  page.evaluate(() => {
    const viewer = window.__viewtopiaViewer;
    return !!viewer && !viewer.isDestroyed?.();
  });

test.beforeEach(async ({ page }) => {
  await page.route(`**${ROADS_URL}`, (route) =>
    route.fulfill({ contentType: 'application/geo+json', body: JSON.stringify(ROADS) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
  });
});

/** The shipped defaults: the globe tab drawn by maplibre. */
async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaRunAction, null, { timeout: BOOT_TIMEOUT });
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: BOOT_TIMEOUT });
}

async function showMapTab(page) {
  await runAction(page, 'view.set_tab', { tab: 'map' });
  await page.waitForFunction(() => !!window.__viewtopiaLeaflet, null, { timeout: SETTLE_TIMEOUT });
}

/** A notice only reads as an error once the chat is on screen. */
async function openChat(page) {
  await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
}

async function importRoads(page) {
  await runAction(page, 'data.import_url', { url: ROADS_URL });
  await expect
    .poll(async () => (await page.evaluate(() => window.__viewtopiaSnapshot())).layers.length, {
      timeout: SETTLE_TIMEOUT,
    })
    .toBe(1);
}

test.describe('camera.fly_to', () => {
  test('a flight moves the maplibre globe', async ({ page }) => {
    await boot(page);
    expect(near(await maplibreCentre(page), FRANCE)).toBe(false);

    await runAction(page, 'camera.fly_to', FRANCE);

    await expect
      .poll(async () => near(await maplibreCentre(page), FRANCE), { timeout: SETTLE_TIMEOUT })
      .toBe(true);
  });

  test('a flight moves the leaflet map', async ({ page }) => {
    await boot(page);
    await showMapTab(page);
    expect(near(await leafletCentre(page), FRANCE)).toBe(false);

    await runAction(page, 'camera.fly_to', FRANCE);

    await expect
      .poll(async () => near(await leafletCentre(page), FRANCE), { timeout: SETTLE_TIMEOUT })
      .toBe(true);
  });
});

test.describe('renderer.set', () => {
  test('cesium takes over the globe tab', async ({ page }) => {
    await boot(page);
    expect(await cesiumUp(page)).toBe(false);

    await runAction(page, 'renderer.set', { renderer: 'cesium' });

    await expect.poll(() => cesiumUp(page), { timeout: SETTLE_TIMEOUT }).toBe(true);
    await expect(page.locator('#cesium-container')).toBeVisible();
    await expect(page.locator('#maplibre-container')).toBeHidden();
  });

  test('a renderer named from the map tab brings the globe back', async ({ page }) => {
    await boot(page);
    await showMapTab(page);
    await expect(page.locator('#leaflet-container')).toBeVisible();

    await runAction(page, 'renderer.set', { renderer: 'cesium' });

    await expect.poll(() => cesiumUp(page), { timeout: SETTLE_TIMEOUT }).toBe(true);
    await expect(page.locator('#cesium-container')).toBeVisible();
    await expect(page.locator('#leaflet-container')).toBeHidden();
    await page.waitForFunction(() => !window.__viewtopiaLeaflet, null, { timeout: SETTLE_TIMEOUT });
  });

  test('the renderer already showing is an error and changes nothing', async ({ page }) => {
    await boot(page);
    await openChat(page);

    await runAction(page, 'renderer.set', { renderer: 'maplibre' });

    await expect(
      page.getByText(
        'The globe is already drawn with maplibre. For the flat 2D map use view.set_tab.',
      ),
    ).toBeVisible({ timeout: SETTLE_TIMEOUT });
    await expect(page.locator('#maplibre-container')).toBeVisible();
    await expect(page.locator('#leaflet-container')).toBeHidden();
    expect(await cesiumUp(page)).toBe(false);
  });
});

test.describe('view.set_tab', () => {
  test('the map tab brings the leaflet map up and the globe tab takes it away', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!window.__viewtopiaLeaflet)).toBe(false);

    await showMapTab(page);
    await expect(page.locator('#leaflet-container')).toBeVisible();
    await expect(page.locator('#maplibre-container')).toBeHidden();

    await runAction(page, 'view.set_tab', { tab: 'globe' });
    await page.waitForFunction(() => !window.__viewtopiaLeaflet, null, { timeout: SETTLE_TIMEOUT });
    await expect(page.locator('#maplibre-container')).toBeVisible();
    await expect(page.locator('#leaflet-container')).toBeHidden();
  });

  test('the tab already showing is an error and changes nothing', async ({ page }) => {
    await boot(page);
    await openChat(page);

    await runAction(page, 'view.set_tab', { tab: 'globe' });

    await expect(page.getByText('The globe is already showing.')).toBeVisible({
      timeout: SETTLE_TIMEOUT,
    });
    await expect(page.locator('#maplibre-container')).toBeVisible();
    expect(await page.evaluate(() => !!window.__viewtopiaLeaflet)).toBe(false);

    await showMapTab(page);
    await runAction(page, 'view.set_tab', { tab: 'map' });

    await expect(page.getByText('The flat map is already showing.')).toBeVisible({
      timeout: SETTLE_TIMEOUT,
    });
    await expect(page.locator('#leaflet-container')).toBeVisible();
    expect(await page.evaluate(() => !!window.__viewtopiaLeaflet)).toBe(true);
  });
});

test.describe('basemap.set', () => {
  // satellite and the shipped default dark are basemaps local-basemap.js serves
  // from disk, so both draw without reaching a tile host
  test('the maplibre globe redraws from the named basemap host', async ({ page }) => {
    await boot(page);
    await expect.poll(() => maplibreBasemapSource(page), { timeout: SETTLE_TIMEOUT }).toEqual({
      tiles: [expect.stringContaining('tiles.openfreemap.org')],
      glyphs: expect.stringContaining('tiles.openfreemap.org'),
    });

    await runAction(page, 'basemap.set', { basemap: 'satellite' });

    await expect.poll(() => maplibreBasemapSource(page), { timeout: SETTLE_TIMEOUT }).toEqual({
      tiles: [expect.stringContaining('server.arcgisonline.com')],
      glyphs: '',
    });
  });

  // needs the maplibre-gl patch, a raster tile load resuming after its abort stalls the image queue
  test('the maplibre globe goes back to a vector basemap', async ({ page }) => {
    await boot(page);
    await runAction(page, 'basemap.set', { basemap: 'satellite' });
    await expect.poll(() => maplibreBasemapSource(page), { timeout: SETTLE_TIMEOUT }).toEqual({
      tiles: [expect.stringContaining('server.arcgisonline.com')],
      glyphs: '',
    });

    await runAction(page, 'basemap.set', { basemap: 'dark' });

    await page.waitForFunction(
      () => window.__viewtopiaMap?.isStyleLoaded() && window.__viewtopiaMap.loaded(),
      null,
      { timeout: VECTOR_BASEMAP_TIMEOUT },
    );
  });

  test('the leaflet map redraws from the named basemap host', async ({ page }) => {
    await boot(page);
    await showMapTab(page);

    await runAction(page, 'basemap.set', { basemap: 'satellite' });
    await expect
      .poll(() => leafletTileTemplate(page), { timeout: SETTLE_TIMEOUT })
      .toContain('server.arcgisonline.com');

    await runAction(page, 'basemap.set', { basemap: 'positron' });
    await expect
      .poll(() => leafletTileTemplate(page), { timeout: SETTLE_TIMEOUT })
      .toContain('basemaps.cartocdn.com');
  });
});

test.describe('layers.set_visible', () => {
  test('hiding a layer takes it off the maplibre globe', async ({ page }) => {
    await boot(page);
    await importRoads(page);
    await expect.poll(() => maplibreLayerIds(page), { timeout: SETTLE_TIMEOUT }).not.toHaveLength(0);

    await runAction(page, 'layers.set_visible', { layer: ROADS_LAYER, visible: false });
    await expect.poll(() => maplibreLayerIds(page), { timeout: SETTLE_TIMEOUT }).toHaveLength(0);

    await runAction(page, 'layers.set_visible', { layer: ROADS_LAYER, visible: true });
    await expect.poll(() => maplibreLayerIds(page), { timeout: SETTLE_TIMEOUT }).not.toHaveLength(0);
  });

  test('hiding a layer takes it off the leaflet map', async ({ page }) => {
    await boot(page);
    await importRoads(page);
    await showMapTab(page);
    await expect.poll(() => leafletPathCount(page), { timeout: SETTLE_TIMEOUT }).toBeGreaterThan(0);

    await runAction(page, 'layers.set_visible', { layer: ROADS_LAYER, visible: false });
    await expect.poll(() => leafletPathCount(page), { timeout: SETTLE_TIMEOUT }).toBe(0);

    await runAction(page, 'layers.set_visible', { layer: ROADS_LAYER, visible: true });
    await expect.poll(() => leafletPathCount(page), { timeout: SETTLE_TIMEOUT }).toBeGreaterThan(0);
  });
});

test.describe('split_view.set', () => {
  const paneMapUp = (page) => page.evaluate(() => !!window.__viewtopiaPaneMap);

  test('a second pane opens and closes beside the globe', async ({ page }) => {
    await boot(page);
    await expect(page.getByTestId('viewer-pane-right')).toHaveCount(0);

    await runAction(page, 'split_view.set', { active: true, layout: 'twoAcross' });
    await expect(page.getByTestId('viewer-pane-right')).toBeVisible();
    await expect.poll(() => paneMapUp(page), { timeout: SETTLE_TIMEOUT }).toBe(true);

    await runAction(page, 'split_view.set', { active: false });
    await expect(page.getByTestId('viewer-pane-right')).toHaveCount(0);
    await expect.poll(() => paneMapUp(page), { timeout: SETTLE_TIMEOUT }).toBe(false);
  });

  test('a second pane opens and closes beside the flat map', async ({ page }) => {
    await boot(page);
    await showMapTab(page);
    await expect(page.getByTestId('viewer-pane-right')).toHaveCount(0);

    await runAction(page, 'split_view.set', { active: true, layout: 'twoAcross' });
    await expect(page.getByTestId('viewer-pane-right')).toBeVisible();
    await expect.poll(() => paneMapUp(page), { timeout: SETTLE_TIMEOUT }).toBe(true);
    // the viewer pane is still the 2D one it was before the split
    await expect(page.getByTestId('viewer-pane-left').locator('#leaflet-container')).toBeVisible();

    await runAction(page, 'split_view.set', { active: false });
    await expect(page.getByTestId('viewer-pane-right')).toHaveCount(0);
    await expect.poll(() => paneMapUp(page), { timeout: SETTLE_TIMEOUT }).toBe(false);
  });
});
