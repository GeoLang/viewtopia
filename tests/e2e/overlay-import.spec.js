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
