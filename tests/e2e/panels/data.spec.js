import { randomUUID } from 'node:crypto';
import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers';
import { mintToken, platformAuthHeaders } from '../../../scripts/platform-token.mjs';

/**
 * Functional smoke for the Data menu panels against the live platform stack.
 * Each test opens its panel through the menu, drives the primary control and
 * reads the effect back out of the live renderer or the platform backend.
 *
 * Catalog talks to tiletopia's /api/v1/portal/items, which keys items on the
 * JWT `sub` as a user id, so the token is minted with a fresh UUID per run and
 * the catalog starts empty. Vector Tiles reads real MVT off ptolemy's
 * demo_parcels branch, discovered by name at run time.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/data.spec.js
 */

/** portal items are owned by claims.sub parsed as a user uuid, so it must be one */
const PORTAL_TOKEN = mintToken({ role: 'editor', sub: randomUUID() });

/** admin: the demo datasets are seeded by another owner, so reads need a grant */
const API_HEADERS = platformAuthHeaders({ role: 'admin', sub: 'panels-data-e2e' });

/** demo_parcels sits in Monaco; the vector tile test needs the map over it. */
const MONACO = { lon: 7.4261, lat: 43.7288 };

/** 1x1 transparent PNG, so the basemap never depends on the public CDN. */
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=',
  'base64',
);

/** Four points along Quai Jean-Charles Rey, so the parsed track has real extent. */
const TRACK_POINTS = [
  [7.42, 43.73, 10],
  [7.421, 43.731, 12],
  [7.422, 43.732, 14],
  [7.423, 43.733, 16],
];

const TRACK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="panel-e2e"><trk><name>panel-e2e track</name><trkseg>
${TRACK_POINTS.map(
  ([lon, lat, ele]) => `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`,
).join('\n')}
</trkseg></trk></gpx>`;

/** Rough centre of the track, which is where the import flight must end up. */
const TRACK_CENTRE = {
  lon: (TRACK_POINTS[0][0] + TRACK_POINTS[TRACK_POINTS.length - 1][0]) / 2,
  lat: (TRACK_POINTS[0][1] + TRACK_POINTS[TRACK_POINTS.length - 1][1]) / 2,
};

/**
 * layer.json for a quantized-mesh provider that has no tiles: the panel's job is
 * to build the provider and hand it to the scene, and an empty availability keeps
 * the globe from requesting terrain nothing here serves.
 */
const TERRAIN_URL = '/panel-e2e-terrain';

/** Where the panel points its default provider: tiletopia through the viewer's proxy. */
const STACK_TERRAIN_URL = '/tiles/v1/terrain/';

/** fenestra, the platform's OGC gateway. On the host, not proxied through :5174. */
const FENESTRA = 'http://localhost:3003';
const TERRAIN_LAYER_JSON = {
  tilejson: '2.1.0',
  format: 'quantized-mesh-1.0',
  scheme: 'tms',
  version: '1.0.0',
  projection: 'EPSG:4326',
  bounds: [-180, -90, 180, 90],
  tiles: ['{z}/{x}/{y}.terrain'],
  available: [],
};

async function openViewer(page, token) {
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TILE }),
  );
  await page.addInitScript((t) => {
    if (t) {
      localStorage.setItem(
        'viewtopia_auth',
        JSON.stringify({
          user: { name: 'panels-data-e2e', email: 'data-e2e@viewtopia.test' },
          token: t,
        }),
      );
    }
  }, token ?? null);
  await openApp(page);
}

async function openPanel(page, label, title) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  // the dropdown overlays the viewer, so wait for it to unmount before driving
  // anything underneath it
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: title });
  await expect(panel).toHaveCount(1);
  return panel;
}

async function closePanel(page, panel) {
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

/** Move a Mantine slider by keyboard, one step per press. */
async function nudgeSlider(page, slider, key, steps) {
  await slider.focus();
  for (let i = 0; i < steps; i++) await page.keyboard.press(key);
}

/** The trash button on the panel's list row naming `text` (rows carry no label). */
function rowDeleteButton(panel, text) {
  return panel
    .locator('[class*="mantine-Group-root"]')
    .filter({ hasText: text })
    .first()
    .getByRole('button');
}

test.describe('Data panels', () => {
  test.describe.configure({ mode: 'parallel' });

  test('portal: a new catalog item reaches the backend and the filters narrow to it', async ({
    page,
  }) => {
    test.skip(!PORTAL_TOKEN, 'no PLATFORM_JWT_SECRET: the portal API can only answer 401');

    const title = `panel-e2e ${randomUUID().slice(0, 8)}`;
    const tag = `e2e-${randomUUID().slice(0, 8)}`;

    await openViewer(page, PORTAL_TOKEN);
    const panel = await openPanel(page, 'Catalog', 'Content Catalog');

    // fresh uuid owner, so this run's catalog is its own
    await expect(panel.getByTestId('portal-signin')).toHaveCount(0);
    await expect(
      panel.getByText('No items found. Add your first item to get started.'),
    ).toBeVisible();
    await expect(panel.getByText(/^0 items$/)).toBeVisible();

    await panel.getByRole('button', { name: 'Add Item' }).click();
    await panel.getByLabel('Title').fill(title);
    await panel.getByRole('textbox', { name: 'Type', exact: true }).click();
    await page.getByRole('option', { name: 'Datasets' }).click();
    await panel.getByLabel('Description').fill('added by the Data panel smoke');
    await panel.getByLabel('Tags (comma-separated)').fill(tag);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();

    const card = panel.locator('[class*="mantine-Card-root"]').filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('dataset');
    await expect(card).toContainText(tag);
    await expect(panel.getByText(/^1 item$/)).toBeVisible();

    // the item came back from tiletopia, not from local state: refetching the
    // catalog with the same session must still list it
    const listed = await page.evaluate(async (headers) => {
      const items = await (await fetch('/api/v1/portal/items', { headers })).json();
      return items.map((i) => ({ id: i.id, title: i.title, type: i.type, tags: i.tags }));
    }, { Authorization: `Bearer ${PORTAL_TOKEN}` });
    const saved = listed.find((i) => i.title === title);
    expect(saved).toBeTruthy();
    expect(saved.type).toBe('dataset');
    expect(saved.tags).toEqual([tag]);

    // the filters run over the fetched items: type Maps excludes a dataset,
    // and a search that misses the tag empties the grid
    await panel.getByPlaceholder('All Types').click();
    await page.getByRole('option', { name: 'Maps' }).click();
    await expect(card).toHaveCount(0);
    await expect(panel.getByText(/^0 items$/)).toBeVisible();

    await panel.getByPlaceholder('All Types').click();
    await page.getByRole('option', { name: 'Datasets' }).click();
    await expect(card).toHaveCount(1);
    await panel.getByPlaceholder('Search items').fill(tag);
    await expect(card).toHaveCount(1);
    await panel.getByPlaceholder('Search items').fill(`${tag}-absent`);
    await expect(card).toHaveCount(0);
    await panel.getByPlaceholder('Search items').fill('');

    // delete is the same round trip in reverse, and it leaves the shared
    // catalog as this run found it
    await card.getByRole('button', { name: 'Delete item' }).click();
    await expect(card).toHaveCount(0);
    await expect(panel.getByText(/^0 items$/)).toBeVisible();
    expect(
      await page.evaluate(async (headers) => {
        const items = await (await fetch('/api/v1/portal/items', { headers })).json();
        return items.length;
      }, { Authorization: `Bearer ${PORTAL_TOKEN}` }),
    ).toBe(0);

    await closePanel(page, panel);
  });

  test('ogc: Add renders the OGC service as a layer on the active renderer', async ({
    page,
  }) => {
    // a public WMS is the use case, but its tiles are outside this stack and one
    // failed request is a console error the guard fails on, so it answers here
    const wmsRequests = [];
    await page.route('https://ows.panel-e2e.test/**', (route) => {
      wmsRequests.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: TILE });
    });

    await openViewer(page);
    const panel = await openPanel(page, 'OGC Layers', 'OGC Layers');

    const imageryCount = () =>
      page.evaluate(() => window.__viewtopiaViewer.imageryLayers.length);
    const before = await imageryCount();

    await panel.getByPlaceholder('Layer name').fill('panel-e2e wms');
    await panel
      .getByPlaceholder('Service URL')
      .fill('https://ows.panel-e2e.test/service?LAYERS=OSM-WMS');
    await panel.getByRole('button', { name: 'Add' }).click();

    // the added service is listed by the panel and draped on the globe. exact,
    // because the status line names it too ('Added panel-e2e wms')
    await expect(panel.getByText('panel-e2e wms', { exact: true })).toBeVisible();
    await expect(panel.getByTestId('ogc-status')).toHaveText('Added panel-e2e wms');
    await expect(panel.getByText('No OGC layers added')).toHaveCount(0);
    await expect.poll(imageryCount, { timeout: 30000 }).toBe(before + 1);

    // the imagery is a real WMS provider aimed at the pasted url, asking for the
    // layer the url named rather than the display name
    await expect.poll(() => wmsRequests.length, { timeout: 30000 }).toBeGreaterThan(0);
    const params = new URLSearchParams(new URL(wmsRequests[0]).search);
    expect(params.get('request')).toBe('GetMap');
    expect(params.get('layers')).toBe('OSM-WMS');
    expect(
      await page.evaluate(() => {
        const layers = window.__viewtopiaViewer.imageryLayers;
        return layers.get(layers.length - 1).imageryProvider.url;
      }),
    ).toContain('ows.panel-e2e.test');

    // the panel owns what it added: removing the row takes the layer off again
    await rowDeleteButton(panel, 'panel-e2e wms').click();
    await expect.poll(imageryCount).toBe(before);

    await closePanel(page, panel);
  });

  test('ogc: a WFS service becomes features and a WMTS template becomes imagery', async ({
    page,
  }) => {
    // fenestra is the platform's own OGC gateway, serving real ptolemy data over
    // WMS/WFS/WMTS. It is not proxied through :5174, so the panel gets absolute
    // urls; it answers with access-control-allow-origin, so the browser can.
    const reachable = await fetch(`${FENESTRA}/wfs?service=WFS&request=GetCapabilities`)
      .then((r) => r.ok)
      .catch(() => false);
    test.skip(!reachable, 'fenestra is not up on :3003');

    await openViewer(page);
    const panel = await openPanel(page, 'OGC Layers', 'OGC Layers');

    const imageryCount = () =>
      page.evaluate(() => window.__viewtopiaViewer.imageryLayers.length);
    const agentLayers = () =>
      page.evaluate(() =>
        Array.from(
          { length: window.__viewtopiaViewer.dataSources.length },
          (_, i) => window.__viewtopiaViewer.dataSources.get(i).name,
        ),
      );
    const before = await imageryCount();
    expect(await agentLayers()).toEqual([]);

    // WFS is vector: the panel fetches GetFeature as GeoJSON and hands it to the
    // agent layers, which every renderer draws
    await panel.getByPlaceholder('Layer name').fill('demo_parcels');
    await panel.getByPlaceholder('Service URL').fill(`${FENESTRA}/wfs`);
    await panel.getByRole('textbox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'WFS' }).click();
    await panel.getByRole('button', { name: 'Add' }).click();

    await expect(panel.getByTestId('ogc-status')).toHaveText(/^demo_parcels: \d+ features$/, {
      timeout: 30000,
    });
    const featureCount = Number(
      (await panel.getByTestId('ogc-status').textContent()).match(/(\d+) features/)[1],
    );
    expect(featureCount).toBeGreaterThan(0);
    await expect.poll(agentLayers, { timeout: 30000 }).toHaveLength(1);
    expect(
      await page.evaluate(
        () => window.__viewtopiaViewer.dataSources.get(0).entities.values.length,
      ),
    ).toBe(featureCount);
    // vector features are not imagery
    expect(await imageryCount()).toBe(before);

    // WMTS is raster: the RESTful template becomes an imagery layer, with the
    // placeholders rewritten to the tile form the renderers speak
    await panel.getByPlaceholder('Layer name').fill('parcel tiles');
    await panel
      .getByPlaceholder('Service URL')
      .fill(`${FENESTRA}/wmts/demo_parcels/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`);
    await panel.getByRole('textbox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'WMTS' }).click();
    // the panel says what form of WMTS it reads, since it does not parse capabilities
    await expect(panel.getByTestId('ogc-wmts-note')).toContainText('RESTful tile template');
    await panel.getByRole('button', { name: 'Add' }).click();

    await expect.poll(imageryCount, { timeout: 30000 }).toBe(before + 1);
    expect(
      await page.evaluate(() => {
        const layers = window.__viewtopiaViewer.imageryLayers;
        return layers.get(layers.length - 1).imageryProvider.url;
      }),
    ).toBe(`${FENESTRA}/wmts/demo_parcels/WebMercatorQuad/{z}/{y}/{x}.png`);

    // each row owns what it added: the WMTS imagery and the WFS features both go
    await rowDeleteButton(panel, 'parcel tiles').click();
    await expect.poll(imageryCount).toBe(before);
    await rowDeleteButton(panel, 'demo_parcels').click();
    await expect.poll(agentLayers).toEqual([]);

    await closePanel(page, panel);
  });

  test('import: a browsed GeoJSON file renders on the globe', async ({ page }) => {
    await openViewer(page);
    const panel = await openPanel(page, 'Import', 'Import Data');

    const dataSourceCount = () =>
      page.evaluate(() => window.__viewtopiaViewer.dataSources.length);
    expect(await dataSourceCount()).toBe(0);

    const geojsonFile = (name, features) => ({
      name,
      mimeType: 'application/geo+json',
      buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })),
    });

    await panel.locator('input[type="file"]').setInputFiles(
      geojsonFile('panel-import.geojson', [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [MONACO.lon, MONACO.lat] },
          properties: { name: 'panel-e2e point' },
        },
      ]),
    );

    await expect(panel.getByTestId('import-status')).toHaveText(
      'panel-import.geojson: 1 features',
    );
    // the imported feature lands on the scene as one entity
    await expect.poll(dataSourceCount, { timeout: 30000 }).toBe(1);
    expect(
      await page.evaluate(
        () => window.__viewtopiaViewer.dataSources.get(0).entities.values.length,
      ),
    ).toBe(1);

    // a file the parsers cannot read reports why and adds nothing
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'broken.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from('{not json'),
    });
    await expect(panel.getByTestId('import-status')).toHaveText(
      'broken.geojson: not valid JSON',
    );
    expect(await dataSourceCount()).toBe(1);

    await closePanel(page, panel);
  });

  test('trackImport: an imported GPX track draws its line and points, and frames them', async ({
    page,
  }) => {
    await openViewer(page);
    const panel = await openPanel(page, 'Tracks', 'Track Import');

    /** Track geometry currently on the live Cesium viewer. */
    const drawn = () =>
      page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        const ids = v.entities.values.map((e) => String(e.id));
        const line = v.entities.values.find((e) => String(e.id).startsWith('track-line-'));
        return {
          lines: ids.filter((i) => i.startsWith('track-line-')).length,
          points: ids.filter((i) => i.startsWith('track-pt-')).length,
          linePositions: line ? line.polyline.positions.getValue(v.clock.currentTime).length : 0,
        };
      });
    /** Where the camera is aimed, in degrees. */
    const cameraDegrees = () =>
      page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        const carto = v.scene.globe.ellipsoid.cartesianToCartographic(v.camera.position);
        return {
          lon: (carto.longitude * 180) / Math.PI,
          lat: (carto.latitude * 180) / Math.PI,
        };
      });

    expect(await drawn()).toEqual({ lines: 0, points: 0, linePositions: 0 });

    await panel.locator('input[type="file"]').setInputFiles({
      name: 'panel-track.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(TRACK_GPX),
    });

    await expect(panel.getByTestId('track-status')).toHaveText(
      `panel-track.gpx: ${TRACK_POINTS.length} points rendered`,
    );
    await expect(panel.getByText(`${TRACK_POINTS.length} pts`)).toBeVisible();
    expect(await drawn()).toEqual({
      lines: 1,
      points: TRACK_POINTS.length,
      linePositions: TRACK_POINTS.length,
    });

    // the parsed points are the ones drawn, not a placeholder shape
    const positions = await page.evaluate(() => {
      const v = window.__viewtopiaViewer;
      const line = v.entities.values.find((e) => String(e.id).startsWith('track-line-'));
      return line.polyline.positions.getValue(v.clock.currentTime).map((c) => {
        const carto = v.scene.globe.ellipsoid.cartesianToCartographic(c);
        return [(carto.longitude * 180) / Math.PI, (carto.latitude * 180) / Math.PI, carto.height];
      });
    });
    positions.forEach(([lon, lat, height], i) => {
      expect(lon).toBeCloseTo(TRACK_POINTS[i][0], 5);
      expect(lat).toBeCloseTo(TRACK_POINTS[i][1], 5);
      expect(height).toBeCloseTo(TRACK_POINTS[i][2], 0);
    });

    // the import flies the camera to the track's bounding sphere
    await expect
      .poll(async () => {
        const { lon, lat } = await cameraDegrees();
        return (
          Math.abs(lon - TRACK_CENTRE.lon) < 0.1 && Math.abs(lat - TRACK_CENTRE.lat) < 0.1
        );
      }, { timeout: 30000 })
      .toBe(true);

    // the panel owns what it drew: removing the row clears the scene
    await rowDeleteButton(panel, `${TRACK_POINTS.length} pts`).click();
    await expect(panel.getByText(`${TRACK_POINTS.length} pts`)).toHaveCount(0);
    expect(await drawn()).toEqual({ lines: 0, points: 0, linePositions: 0 });

    await closePanel(page, panel);
  });

  test('vectorTiles: Add Source renders ptolemy MVT features on the MapLibre map', async ({
    page,
  }) => {
    await openViewer(page);

    const branchId = await page.evaluate(async (headers) => {
      const datasets = await (await fetch('/api/v1/datasets', { headers })).json();
      const dataset = datasets.find((d) => d.name === 'demo_parcels');
      if (!dataset) return null;
      const branches = await (
        await fetch(`/api/v1/datasets/${dataset.id}/branches`, { headers })
      ).json();
      return (branches.find((b) => b.name === 'main') ?? branches[0])?.id ?? null;
    }, API_HEADERS);
    expect(branchId, 'demo_parcels/main must be seeded in the stack').toBeTruthy();

    // the panel draws on MapLibre, so switch renderer and put the map over the
    // parcels before adding the source
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, {
      timeout: 60000,
    });
    await page.evaluate(
      (c) => window.__viewtopiaMap.jumpTo({ center: [c.lon, c.lat], zoom: 14 }),
      MONACO,
    );

    const panel = await openPanel(page, 'Vector Tiles', 'Vector Tiles');

    /** The vector tile source the panel added, and what MapLibre parsed from it. */
    const source = () =>
      page.evaluate(() => {
        const map = window.__viewtopiaMap;
        const style = map.getStyle();
        const id = Object.keys(style.sources).find((k) => k.startsWith('vt-'));
        if (!id) return null;
        const fill = style.layers.find((l) => l.id === `${id}-fill`);
        const line = style.layers.find((l) => l.id === `${id}-line`);
        return {
          id,
          type: style.sources[id].type,
          tiles: style.sources[id].tiles,
          fillSourceLayer: fill?.['source-layer'] ?? null,
          fillPaint: fill?.paint ?? null,
          linePaint: line?.paint ?? null,
          features: map.querySourceFeatures(id, { sourceLayer: 'features' }).length,
        };
      });

    expect(await source()).toBeNull();

    // the panel's own placeholder shape: MapLibre builds tile requests in a
    // worker, where a root-relative template has no base to resolve against, so
    // the panel has to put the origin in front of it before adding the source
    const origin = await page.evaluate(() => location.origin);
    const template = `/api/v1/branches/${branchId}/tiles/{z}/{x}/{y}`;
    const url = `${origin}${template}`;
    await panel.getByPlaceholder('Source name').fill('panel-e2e parcels');
    await panel.getByPlaceholder('/api/v1/branches').fill(template);
    await panel.getByLabel('Source layer').fill('features');
    await panel.getByRole('button', { name: 'Add Source' }).click();

    await expect(panel.getByTestId('vt-status')).toHaveText('Added panel-e2e parcels');
    await expect(panel.getByText('panel-e2e parcels', { exact: true })).toBeVisible();

    const added = await source();
    expect(added.type).toBe('vector');
    expect(added.tiles).toEqual([url]);
    expect(added.fillSourceLayer).toBe('features');
    expect(added.fillPaint).toEqual({ 'fill-color': '#a78bfa', 'fill-opacity': 0.25 });
    expect(added.linePaint).toEqual({ 'line-color': '#a78bfa', 'line-width': 1.5 });

    // real parcels arrive off ptolemy's MVT endpoint into the added source
    await expect
      .poll(async () => (await source())?.features ?? 0, { timeout: 60000 })
      .toBeGreaterThan(0);

    // the panel owns the source: removing the row takes both layers with it
    await rowDeleteButton(panel, 'panel-e2e parcels').click();
    await expect.poll(source).toBeNull();
    expect(
      await page.evaluate((id) => {
        const map = window.__viewtopiaMap;
        return [map.getLayer(`${id}-fill`), map.getLayer(`${id}-line`)].map((l) => !!l);
      }, added.id),
    ).toEqual([false, false]);

    await closePanel(page, panel);
  });

  test('globalTerrain: the provider and exaggeration controls drive the live Cesium scene', async ({
    page,
  }) => {
    // Cesium World Terrain needs an Ion token this stack has none of, so the
    // custom-provider path is driven against a served layer.json instead.
    // an empty availability is why only layer.json is served: the globe asks for
    // no terrain tiles, so a tile request here would be an unrouted 404 the
    // console guard fails on
    await page.route(`**${TERRAIN_URL}/layer.json`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TERRAIN_LAYER_JSON) }),
    );

    await openViewer(page);
    const panel = await openPanel(page, 'Terrain', 'Global Terrain');

    // the default provider is the platform's own terrain, named by its relative
    // url; enabling it is a test of its own, below
    await expect(panel.getByRole('textbox', { name: 'Provider' })).toHaveValue('Platform terrain');
    await expect(panel.getByText(STACK_TERRAIN_URL, { exact: true })).toBeVisible();

    /** What the scene currently uses for elevation. */
    const terrain = () =>
      page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        const changed = window.__panelTerrain !== v.terrainProvider;
        window.__panelTerrain = v.terrainProvider;
        return {
          exaggeration: v.scene.verticalExaggeration,
          // only CesiumTerrainProvider carries the vertex-normal request flag, so
          // this says which class the scene holds without a minified class name
          quantizedMesh: 'requestVertexNormals' in v.terrainProvider,
          providerUrl: v.terrainProvider._layers?.[0]?.resource?.url ?? null,
          changed,
        };
      });

    // baseline: default ellipsoid, no exaggeration
    await expect(panel.getByTestId('terrain-status')).toHaveText('Ellipsoid (default)');
    const start = await terrain();
    expect(start.exaggeration).toBe(1);
    expect(start.quantizedMesh).toBe(false);
    expect(start.providerUrl).toBeNull();

    // the slider drives scene.verticalExaggeration live, 0.5 per step
    await nudgeSlider(page, panel.locator('[role="slider"]'), 'ArrowRight', 4);
    await expect(panel).toContainText('Exaggeration: 3.0×');
    await expect.poll(async () => (await terrain()).exaggeration).toBe(3);

    // a custom provider replaces the scene's terrain provider
    await panel.getByRole('textbox', { name: 'Provider' }).click();
    await page.getByRole('option', { name: 'Custom URL' }).click();
    await panel.getByLabel('Terrain URL').fill(TERRAIN_URL);
    await panel.getByRole('button', { name: 'Enable Terrain' }).click();

    await expect(panel.getByTestId('terrain-status')).toHaveText('Custom terrain enabled');
    const custom = await terrain();
    expect(custom.changed).toBe(true);
    expect(custom.quantizedMesh).toBe(true);
    // the provider was built from the URL typed into the panel
    expect(custom.providerUrl).toContain(TERRAIN_URL);
    // the provider swap leaves the exaggeration the slider set alone
    expect(custom.exaggeration).toBe(3);

    await panel.getByRole('button', { name: 'Reset to Ellipsoid' }).click();
    await expect(panel.getByTestId('terrain-status')).toHaveText('Ellipsoid (default)');
    const reset = await terrain();
    expect(reset.changed).toBe(true);
    expect(reset.quantizedMesh).toBe(false);
    expect(reset.providerUrl).toBeNull();

    await closePanel(page, panel);
  });

  test('globalTerrain: the platform provider enables, and says so when it cannot', async ({
    page,
  }) => {
    // layer.json is answered here, both ways round, so the test says the same
    // thing whatever the deployment serves: an empty availability keeps the globe
    // from asking for terrain tiles, and the unreachable case is an answer Cesium
    // rejects rather than a 4xx, whose failed load the console guard fails on.
    let answer = 'terrain';
    await page.route(`**${STACK_TERRAIN_URL}**`, (route) => {
      const url = route.request().url();
      if (!url.endsWith('layer.json')) {
        // Cesium asks for the two root tiles whatever the availability says, and
        // this url is a live one: tiletopia answers those 400, which would fail
        // this test on the terrain service rather than on the panel
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
      }
      if (answer === 'terrain') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(TERRAIN_LAYER_JSON),
        });
      }
      // a 200 that is not a terrain layer.json: what an endpoint serving
      // something else looks like, without the console noise of a 4xx
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    });

    await openViewer(page);
    const panel = await openPanel(page, 'Terrain', 'Global Terrain');
    const status = panel.getByTestId('terrain-status');

    await expect(panel.getByRole('textbox', { name: 'Provider' })).toHaveValue('Platform terrain');
    await panel.getByRole('button', { name: 'Enable Terrain' }).click();

    await expect(status).toHaveText('Platform terrain enabled');
    expect(
      await page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        return {
          quantizedMesh: 'requestVertexNormals' in v.terrainProvider,
          url: v.terrainProvider._layers?.[0]?.resource?.url ?? null,
        };
      }),
    ).toEqual({ quantizedMesh: true, url: expect.stringContaining(STACK_TERRAIN_URL) });

    // and when the service does not answer with terrain, the panel says so
    // instead of leaving the last status up
    await panel.getByRole('button', { name: 'Reset to Ellipsoid' }).click();
    await expect(status).toHaveText('Ellipsoid (default)');
    answer = 'unusable';
    await panel.getByRole('button', { name: 'Enable Terrain' }).click();
    await expect(status).toHaveText(
      'No terrain source: the platform terrain service did not answer, terrain stays off',
    );
    expect(
      await page.evaluate(() => 'requestVertexNormals' in window.__viewtopiaViewer.terrainProvider),
    ).toBe(false);

    await closePanel(page, panel);
  });
});
