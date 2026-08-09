import { test, expect } from './console-guard';

/**
 * Image overlays through the paths only a real browser has: a file dropped on
 * the window, corner handles dragged on the MapLibre map, and a saved project
 * finding its bitmap back in IndexedDB after a reload.
 *
 * The panels suite covers world file and .prj georeferencing; this one covers
 * the plain drop-and-place flow. MapLibre is the shipped default renderer, and
 * corner handles are MapLibre only, so no renderer is seeded here.
 *
 * Run: npm run test:e2e:react
 */

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const HANDLE = '[data-testid="overlay-corner-handle"]';
const PANEL =
  'main > [class*="mantine-Paper-root"], .panel-dock [class*="mantine-Paper-root"], [class*="mantine-Modal-content"]';

const RASTER_TILE_HOSTS =
  /https:\/\/(basemaps\.cartocdn\.com|tile\.openstreetmap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com)\//;

// the Cesium basemaps are raster tiles from CDNs this suite has no reason to
// reach, and the console guard counts a failed tile as an error. These tests
// read the overlay, never the map under it.
test.beforeEach(async ({ page }) => {
  await page.route(RASTER_TILE_HOSTS, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(ONE_PIXEL_PNG, 'base64'),
    }),
  );
});

async function dropPng(page, name) {
  const dataTransfer = await page.evaluateHandle(
    ([base64, fileName]) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], fileName, { type: 'image/png' }));
      return transfer;
    },
    [ONE_PIXEL_PNG, name],
  );
  await page.dispatchEvent('body', 'drop', { dataTransfer });
}

/** The image sources the overlay hook put on the map, by source id. */
function overlaySources(page) {
  return page.evaluate(() => {
    const sources = window.__viewtopiaMap?.getStyle()?.sources ?? {};
    return Object.entries(sources)
      .filter(([id]) => id.startsWith('agent-raster-'))
      .map(([id, source]) => ({ id, coordinates: source.coordinates }));
  });
}

async function waitForMap(page) {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__viewtopiaMap?.isStyleLoaded())), {
      timeout: 30000,
    })
    .toBe(true);
}

test('a dropped png drapes on the middle of the view with corner handles', async ({ page }) => {
  await waitForMap(page);
  await dropPng(page, 'plan.png');

  await expect(page.locator(HANDLE)).toHaveCount(4);

  const [source] = await overlaySources(page);
  expect(source.coordinates).toHaveLength(4);

  // centred on the view, and inside it
  const bounds = await page.evaluate(() => {
    const b = window.__viewtopiaMap.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  });
  const longitudes = source.coordinates.map(([lng]) => lng);
  const latitudes = source.coordinates.map(([, lat]) => lat);
  expect(Math.min(...longitudes)).toBeGreaterThan(bounds[0]);
  expect(Math.max(...longitudes)).toBeLessThan(bounds[2]);
  expect((Math.min(...longitudes) + Math.max(...longitudes)) / 2).toBeCloseTo(
    (bounds[0] + bounds[2]) / 2,
    4,
  );
  expect((Math.min(...latitudes) + Math.max(...latitudes)) / 2).toBeCloseTo(
    (bounds[1] + bounds[3]) / 2,
    4,
  );

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.locator(PANEL).filter({ hasText: 'Layers (' }).getByText('plan.png')).toBeVisible();
});

test('dragging a corner handle moves that corner alone', async ({ page }) => {
  await waitForMap(page);
  await dropPng(page, 'plan.png');
  await expect(page.locator(HANDLE)).toHaveCount(4);

  const [before] = await overlaySources(page);
  const handle = page.locator(HANDLE).first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 60, { steps: 8 });
  await page.mouse.up();

  const [after] = await overlaySources(page);
  expect(after.coordinates[0]).not.toEqual(before.coordinates[0]);
  // an image source takes any quad, so the other three stay where they were
  expect(after.coordinates.slice(1)).toEqual(before.coordinates.slice(1));
});

async function switchRenderer(page, label) {
  await page.getByRole('button', { name: 'Basemap & renderer' }).click();
  await page.locator('input[value="CesiumJS"], input[value="MapLibre"]').first().click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/**
 * How Cesium is drawing the overlay: as terrain-draped imagery, or as a quad.
 * The overlay's imagery comes from its data URL, which is what tells it apart
 * from the basemap's tiles.
 */
function cesiumOverlay(page) {
  return page.evaluate(() => {
    const viewer = window.__viewtopiaViewer;
    if (!viewer || viewer.isDestroyed?.()) return null;
    const entities = viewer.entities.values.filter((e) =>
      String(e.id).startsWith('agent-raster-'),
    );
    let drapedImages = 0;
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const url = viewer.imageryLayers.get(i).imageryProvider?.url;
      if (String(url ?? '').startsWith('data:image')) drapedImages += 1;
    }
    return {
      quadEntities: entities.length,
      drapedImages,
      height: entities[0]
        ? entities[0].polygon.height.getValue(viewer.clock.currentTime)
        : null,
    };
  });
}

test('cesium drapes a rectangle as imagery and warps a dragged quad', async ({ page }) => {
  await waitForMap(page);
  await dropPng(page, 'plan.png');
  await expect(page.locator(HANDLE)).toHaveCount(4);

  // a rectangle stays on the imagery path, which follows the terrain
  await switchRenderer(page, 'CesiumJS');
  await expect.poll(() => cesiumOverlay(page).then((o) => o?.drapedImages ?? -1)).toBe(1);
  expect((await cesiumOverlay(page)).quadEntities).toBe(0);

  await switchRenderer(page, 'MapLibre');
  await expect(page.locator(HANDLE)).toHaveCount(4);
  const handle = page.locator(HANDLE).first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 - 70, { steps: 8 });
  await page.mouse.up();

  await switchRenderer(page, 'CesiumJS');
  await expect.poll(() => cesiumOverlay(page).then((o) => o?.quadEntities ?? -1)).toBe(1);
  const warped = await cesiumOverlay(page);
  // the quad left the imagery path entirely, and its polygon carries a height,
  // without which Cesium would drape it and ignore the texture coordinates
  expect(warped.drapedImages).toBe(0);
  expect(warped.height).toBe(0);
});

test('an overlay comes back from IndexedDB when its project is reopened', async ({ page }) => {
  await waitForMap(page);
  await dropPng(page, 'plan.png');
  await expect(page.locator(HANDLE)).toHaveCount(4);
  const [saved] = await overlaySources(page);

  await page.getByRole('button', { name: 'Data' }).click();
  await page
    .locator('[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]')
    .filter({ hasText: 'Project' })
    .first()
    .click();
  const projectPanel = page.locator(PANEL).filter({ hasText: 'Project' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    projectPanel.getByRole('button', { name: 'Save' }).click(),
  ]);
  const file = await download.path();

  // a reload drops every store; only IndexedDB still holds the picture
  await waitForMap(page);
  expect(await overlaySources(page)).toEqual([]);

  await page.getByRole('button', { name: 'Data' }).click();
  await page
    .locator('[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]')
    .filter({ hasText: 'Project' })
    .first()
    .click();
  await page.locator(PANEL).filter({ hasText: 'Project' }).locator('input[type="file"]').setInputFiles(file);

  await expect.poll(() => overlaySources(page).then((s) => s.length)).toBe(1);
  const [restored] = await overlaySources(page);
  expect(restored.coordinates).toEqual(saved.coordinates);
});
