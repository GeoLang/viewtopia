import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp, openBasemapRendererControl } from '../panel-helpers';
import { mintToken } from '../../../scripts/platform-token.mjs';

/**
 * Functional smoke for the Analysis menu panels against the live platform stack.
 * Each test opens the panel through its menu path, drives the primary control and
 * asserts the effect it produces: a Cesium data source / imagery layer, a deck.gl
 * layer, or a scene property.
 *
 * tiletopia's /tiles/v1/analysis/* POSTs need a platform session, so the token is
 * seeded into the auth store's localStorage key before boot (see lib/apiAuth.ts).
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/analysis.spec.js
 */

const TOKEN = mintToken({ role: 'editor', sub: 'panels-analysis-e2e' });

/** Small area near Monaco, so the panels' view-derived bboxes are city sized. */
const VIEW = { lon: 7.425, lat: 43.735, height: 8000 };

/** Source/layer id prefix of a native maplibre heatmap (src/lib/mapHeatmap.ts). */
const HEATMAP_PREFIX = 'native-heatmap-';

const POINTS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: { weight: 5 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.12, 51.51] }, properties: { weight: 2 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.09, 51.49] }, properties: { weight: 9 } },
  ],
};

/** 256px gray tile, so the basemap never depends on the public CDN. */
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAB+0lEQVR42u3TMQ0AAAzDsPLHU4C9h2E2hEhJ4bFIgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAATAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADADXAJwlH6V1Y2tLAAAAAElFTkSuQmCC',
  'base64',
);

async function openViewer(page) {
  // the basemap CDN is outside this stack: one DNS hiccup on a tile is a console
  // error the guard fails the test on, so the tiles are served from here
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TILE }),
  );
  await page.addInitScript((token) => {
    if (token) {
      localStorage.setItem(
        'viewtopia_auth',
        JSON.stringify({ user: { email: 'panels-e2e@example.com' }, token }),
      );
    }
  }, TOKEN);
  await openApp(page);
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: 'Analysis' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  // the dropdown overlays the canvas, so a map click can land on a menu item
  // instead of the globe until it unmounts
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL);
  await expect(panel).toHaveCount(1);
  return panel;
}

async function closePanel(page, panel) {
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

/** Aim the camera at VIEW; the panels read the current view for their bbox. */
async function zoomToView(page, view) {
  await page.evaluate((v) => {
    const viewer = window.__viewtopiaViewer;
    const rad = (d) => (d * Math.PI) / 180;
    viewer.camera.setView({
      destination: viewer.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: rad(v.lon),
        latitude: rad(v.lat),
        height: v.height,
      }),
    });
  }, view);
}

/** Names of the data sources on the live Cesium viewer. */
const dataSourceNames = (page) =>
  page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed()) return null;
    return Array.from({ length: v.dataSources.length }, (_, i) => v.dataSources.get(i).name ?? '');
  });

/** Results the panels draw like any other layer, so `layers.*` can reach them. */
const VIEWSHED_SOURCE = 'agent-layer-viewshed-result';
const CONTOURS_SOURCE = 'agent-layer-contours-result';

/** Entity count of a named data source, or -1 when it is not loaded. */
const namedEntityCount = (page, name) =>
  page.evaluate((n) => {
    const ds = window.__viewtopiaViewer?.dataSources.getByName(n)[0];
    return ds ? ds.entities.values.length : -1;
  }, name);

/**
 * Show MapLibre instead of Cesium and frame the view on the map itself, so the
 * bbox a panel reads can only have come from the renderer on screen.
 */
async function useMapLibreAt(page, view) {
  await openBasemapRendererControl(page);
  await page.getByRole('textbox', { name: 'Renderer' }).click();
  await page.getByRole('option', { name: 'MapLibre' }).click();
  await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, { timeout: 60000 });
  await page.evaluate(
    (v) => window.__viewtopiaMap.jumpTo({ center: [v.lon, v.lat], zoom: 12 }),
    view,
  );
}

/** ids of the layers the live MapLibre map draws for a result source. */
const mapLayerIds = (page, prefix) =>
  page.evaluate((p) => {
    const m = window.__viewtopiaMap;
    if (!m) return null;
    return (m.getStyle()?.layers ?? []).map((l) => l.id).filter((id) => id.startsWith(p));
  }, prefix);

/** Alphas of the Cesium imagery layers, base layer first. */
const imageryAlphas = (page) =>
  page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    return Array.from({ length: v.imageryLayers.length }, (_, i) => v.imageryLayers.get(i).alpha);
  });

/** ids of the layers the map's deck.gl overlay currently draws. */
const deckLayerIds = (page) =>
  page.evaluate(() => window.__viewtopiaDeck?.props?.layers?.map((l) => l.id) ?? []);

/** Move a Mantine slider by keyboard, one step per press. */
async function nudgeSlider(page, slider, key, steps) {
  await slider.focus();
  for (let i = 0; i < steps; i++) await page.keyboard.press(key);
}

test.describe('Analysis panels', () => {
  test.describe.configure({ mode: 'parallel' });

  test('clipping: the axis and position controls drive the scene clipping planes', async ({
    page,
  }) => {
    await openViewer(page);
    const panel = await openPanel(page, 'Clip');

    // full state of the globe's clipping planes, or null when the globe is unclipped
    const clipState = () =>
      page.evaluate(() => {
        const planes = window.__viewtopiaViewer.scene.globe.clippingPlanes;
        if (!planes) return null;
        return {
          enabled: planes.enabled,
          count: planes.length,
          planes: Array.from({ length: planes.length }, (_, i) => {
            const p = planes.get(i);
            return { normal: [p.normal.x, p.normal.y, p.normal.z], distance: p.distance };
          }),
        };
      });
    const clipping = async () => {
      const s = await clipState();
      return !!s && s.enabled && s.count > 0;
    };

    expect(await clipping()).toBe(false);

    await panel.getByRole('button', { name: 'Enable Clip' }).click();
    await expect(panel.getByRole('button', { name: 'Disable Clip' })).toBeVisible();

    const enabled = await clipState();
    expect(await clipping()).toBe(true);
    const [plane] = enabled.planes;
    expect(Math.hypot(...plane.normal)).toBeCloseTo(1, 5);
    expect(Number.isFinite(plane.distance)).toBe(true);

    // position starts at 50%; ten steps moves the cut, so the plane distance shifts
    await nudgeSlider(page, panel.locator('[role="slider"]').first(), 'ArrowRight', 10);
    await expect(panel).toContainText('Position: 60%');
    const moved = await clipState();
    expect(moved.count).toBe(enabled.count);
    expect(moved.planes[0].distance).not.toBeCloseTo(plane.distance, 3);

    // a different axis cuts along a different normal, at the same plane count
    await panel.getByText('X', { exact: true }).click();
    await expect(panel.getByRole('radio', { name: 'X' })).toBeChecked();
    const other = await clipState();
    expect(other.count).toBe(moved.count);
    expect(other.planes[0].normal).not.toEqual(moved.planes[0].normal);

    await panel.getByRole('button', { name: 'Disable Clip' }).click();
    await expect(panel.getByRole('button', { name: 'Enable Clip' })).toBeVisible();
    expect(await clipping()).toBe(false);

    await closePanel(page, panel);
    expect(await clipping()).toBe(false);
  });

  test('crossSection: Generate Profile samples the line into a chart and draws it', async ({
    page,
  }) => {
    // The DEM comes from the public Open-Elevation API, which is outside this
    // stack: serve a ramp instead, so the profile values are the panel's own work.
    await page.route('https://api.open-elevation.com/**', async (route) => {
      const locations = new URL(route.request().url()).searchParams.get('locations') ?? '';
      const results = locations.split('|').map((loc, i) => {
        const [latitude, longitude] = loc.split(',').map(Number);
        return { latitude, longitude, elevation: i * 10 };
      });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results }) });
    });

    await openViewer(page);
    const panel = await openPanel(page, 'Section');
    expect(await dataSourceNames(page)).toEqual([]);

    await panel.getByLabel('Sample Points').fill('10');
    await panel.getByRole('button', { name: 'Generate Profile' }).click();

    // 11 samples off the ramp above: 0 m to 100 m, climbing all the way.
    await expect(page.getByTestId('crosssection-stats')).toContainText('Min Elev: 0 m');
    await expect(page.getByTestId('crosssection-stats')).toContainText('Max Elev: 100 m');
    await expect(page.getByTestId('crosssection-stats')).toContainText('Gain:     +100 m');
    await expect(page.locator('svg[aria-label="elevation profile"]')).toBeVisible();

    // the sampled path is drawn onto the scene as one polyline entity
    await expect.poll(() => dataSourceNames(page), { timeout: 30000 }).toHaveLength(1);
    expect(
      await page.evaluate(() => window.__viewtopiaViewer.dataSources.get(0).entities.values.length),
    ).toBe(1);

    await closePanel(page, panel);
  });

  test('heatmap: Add renders a native maplibre heatmap layer at the chosen radius', async ({
    page,
  }) => {
    await openViewer(page);
    const panel = await openPanel(page, 'Heatmap');

    await panel.getByRole('textbox', { name: 'GeoJSON' }).fill(JSON.stringify(POINTS));
    // radius starts at 30px; five steps up must reach the layer as heatmap-radius 35
    await nudgeSlider(page, panel.locator('[role="slider"]').first(), 'ArrowRight', 5);
    await expect(panel).toContainText('Radius: 35px');

    await panel.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByTestId('heatmap-status')).toHaveText('Heatmap added: 3 points');
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({ timeout: 30000 });
    // deck's HeatmapLayer draws nothing under the globe projection, so the panel
    // goes through maplibre's own heatmap layer type
    await expect
      .poll(() => mapLayerIds(page, HEATMAP_PREFIX), { timeout: 30000 })
      .toEqual([`${HEATMAP_PREFIX}panel-heatmap`]);
    expect(
      await page.evaluate(
        (id) => window.__viewtopiaMap.getPaintProperty(id, 'heatmap-radius'),
        `${HEATMAP_PREFIX}panel-heatmap`,
      ),
    ).toBe(35);
    expect(
      await page.evaluate(
        async (id) => (await window.__viewtopiaMap.getSource(id).getData()).features.length,
        `${HEATMAP_PREFIX}panel-heatmap`,
      ),
    ).toBe(3);

    await page.locator(PANEL).first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('heatmap-status')).toHaveText('Heatmap removed');
    await expect.poll(() => mapLayerIds(page, HEATMAP_PREFIX)).toEqual([]);

    await closePanel(page, page.locator(PANEL));
  });

  test('shadows: enabling and moving the clock drive the live Cesium scene', async ({ page }) => {
    await openViewer(page);
    const panel = await openPanel(page, 'Shadows');

    const scene = () =>
      page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        return {
          shadows: v.shadows,
          lighting: v.scene.globe.enableLighting,
          clock: v.clock.currentTime.toString(),
        };
      });

    const before = await scene();
    expect(before.shadows).toBe(false);
    await expect(page.getByTestId('shadows-status')).toHaveText('shadows off @ 12:00');

    await panel.getByText('Enable Shadows').click();
    await expect(page.getByTestId('shadows-status')).toHaveText('shadows on @ 12:00');
    const enabled = await scene();
    expect(enabled.shadows).toBe(true);
    expect(enabled.lighting).toBe(true);

    // time of day is the first slider; step 0.25h, so eight presses is +2h
    await nudgeSlider(page, panel.locator('[role="slider"]').first(), 'ArrowRight', 8);
    await expect(page.getByTestId('shadows-status')).toHaveText('shadows on @ 14:00');
    const moved = await scene();
    expect(moved.clock).not.toBe(enabled.clock);
    expect(moved.shadows).toBe(true);

    await closePanel(page, panel);
  });

  test('viewshed: Compute renders the visible-area polygon for the placed observer', async ({
    page,
  }) => {
    await openViewer(page);
    await zoomToView(page, VIEW);
    const panel = await openPanel(page, 'Viewshed');

    await panel.getByRole('button', { name: 'Place Observer' }).click();
    const canvas = await page.locator('canvas').first().boundingBox();
    await page.mouse.click(canvas.x + canvas.width * 0.7, canvas.y + canvas.height * 0.5);
    await expect(panel.getByText(/^Observer: /)).toBeVisible();

    expect(await namedEntityCount(page, VIEWSHED_SOURCE)).toBe(-1);
    await panel.getByRole('button', { name: 'Compute' }).click();

    // tiletopia answers with one MultiPolygon member per visible cell, so the
    // entity count is the drawn cell count and matches the feature's readout
    await expect
      .poll(() => namedEntityCount(page, VIEWSHED_SOURCE), { timeout: 30000 })
      .toBeGreaterThan(0);
    const drawn = await page.evaluate((source) => {
      const entities =
        window.__viewtopiaViewer.dataSources.getByName(source)[0].entities.values;
      return {
        count: entities.length,
        polygons: entities.filter((e) => e.polygon).length,
        visibleCells: entities[0].properties.visible_cells.getValue(),
      };
    }, VIEWSHED_SOURCE);
    expect(drawn.polygons).toBe(drawn.count);
    expect(drawn.visibleCells).toBe(drawn.count);

    // the result is framed by a camera flight, and the panel only takes ownership
    // of the layer once that flight resolves
    await expect
      .poll(
        () =>
          page.evaluate((from) => {
            const v = window.__viewtopiaViewer;
            const carto = v.scene.globe.ellipsoid.cartesianToCartographic(v.camera.position);
            return v.scene.tweens.length === 0 && carto.height < from / 2;
          }, VIEW.height),
        { timeout: 30000 },
      )
      .toBe(true);

    // the panel owns the layer: closing it takes the result off the scene
    await closePanel(page, panel);
    // taking the result off is a store edit the renderer picks up when it next
    // settles, so it gets the same budget as drawing it
    await expect.poll(() => namedEntityCount(page, VIEWSHED_SOURCE), { timeout: 30000 }).toBe(-1);
  });

  test('terrainAnalysis: Run drapes a raster the opacity slider controls, then contours', async ({
    page,
  }) => {
    await openViewer(page);
    await zoomToView(page, VIEW);
    const panel = await openPanel(page, 'Terrain');

    expect(await imageryAlphas(page)).toEqual([1]);
    await panel.getByRole('button', { name: 'Run', exact: true }).click();

    // slope PNG draped over the current view at the panel's 70% opacity
    await expect.poll(() => imageryAlphas(page), { timeout: 30000 }).toEqual([1, 0.7]);

    // the slider drives the live layer, no re-run needed
    await nudgeSlider(page, panel.locator('[role="slider"]').first(), 'ArrowLeft', 10);
    await expect(panel).toContainText('Opacity: 60%');
    await expect.poll(() => imageryAlphas(page)).toEqual([1, 0.6]);

    // contours replace the raster with line features
    await panel.getByRole('textbox', { name: 'Analysis Type' }).click();
    await page.getByRole('option', { name: 'Contour Lines' }).click();
    await panel.getByRole('button', { name: 'Run', exact: true }).click();
    await expect
      .poll(() => namedEntityCount(page, CONTOURS_SOURCE), { timeout: 30000 })
      .toBeGreaterThan(10);
    await expect.poll(() => imageryAlphas(page)).toEqual([1]);

    await closePanel(page, panel);
    // the scene picks the removal up when it next settles
    await expect.poll(() => dataSourceNames(page), { timeout: 30000 }).toEqual([]);
  });

  test('terrainAnalysis on MapLibre: the result draws on the renderer being shown', async ({
    page,
  }) => {
    await openViewer(page);
    await useMapLibreAt(page, VIEW);
    const panel = await openPanel(page, 'Terrain');

    expect(await mapLayerIds(page, 'terrain-result')).toEqual([]);
    await panel.getByRole('button', { name: 'Run', exact: true }).click();

    // the slope PNG is draped on the MapLibre map, at the panel's 70% opacity
    await expect
      .poll(() => mapLayerIds(page, 'terrain-result'), { timeout: 60000 })
      .toEqual(['terrain-result-raster']);
    // the defect: with Cesium hidden the panel could read no view at all
    await expect(panel.getByText('Cannot read the current map view')).toHaveCount(0);
    await expect(panel.getByText('Terrain request failed')).toHaveCount(0);

    // and it is draped over the box this map is showing, not a stale Cesium view
    const { corners, bounds } = await page.evaluate(() => {
      const m = window.__viewtopiaMap;
      const b = m.getBounds();
      return {
        corners: m.getStyle().sources['terrain-result'].coordinates,
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      };
    });
    const round = (v) => Math.round(v * 1000) / 1000;
    const [[west, north], , [east, south]] = corners;
    expect([west, south, east, north].map(round)).toEqual(bounds.map(round));

    // the slider drives the live raster layer, no re-run needed
    const rasterOpacity = () =>
      page.evaluate(() =>
        window.__viewtopiaMap.getPaintProperty('terrain-result-raster', 'raster-opacity'),
      );
    expect(await rasterOpacity()).toBeCloseTo(0.7, 2);
    await nudgeSlider(page, panel.locator('[role="slider"]').first(), 'ArrowLeft', 10);
    await expect(panel).toContainText('Opacity: 60%');
    await expect.poll(rasterOpacity).toBe(0.6);

    // contours take the raster's place, as line features on the same map
    await panel.getByRole('textbox', { name: 'Analysis Type' }).click();
    await page.getByRole('option', { name: 'Contour Lines' }).click();
    await panel.getByRole('button', { name: 'Run', exact: true }).click();
    await expect
      .poll(() => mapLayerIds(page, CONTOURS_SOURCE), { timeout: 60000 })
      .toEqual([
        `${CONTOURS_SOURCE}-fill`,
        `${CONTOURS_SOURCE}-line`,
        `${CONTOURS_SOURCE}-circle`,
      ]);
    await expect.poll(() => mapLayerIds(page, 'terrain-result')).toEqual([]);
    expect(
      await page.evaluate(
        (source) => window.__viewtopiaMap.getSource(source).serialize().data.features.length,
        CONTOURS_SOURCE,
      ),
    ).toBeGreaterThan(10);

    // the panel owns the layers: closing it takes them off the map, which the
    // map picks up when it next settles
    await closePanel(page, panel);
    await expect.poll(() => mapLayerIds(page, CONTOURS_SOURCE), { timeout: 60000 }).toEqual([]);
  });
});
