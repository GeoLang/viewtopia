import { test, expect } from './console-guard';
import { MENU_ITEM } from './panel-helpers';

/**
 * The 3D and 2D tabs act on the highlighted split pane: that pane swaps
 * renderer, the others stay as they were, and the layout holds.
 *
 * Run: npm run test:e2e:react
 */

const BOOT_TIMEOUT = 60000;

const paneLeafletUp = (page, index) =>
  page.evaluate((i) => !!window.__viewtopiaPaneLeaflets?.[i], index);

test('the 2D tab switches the highlighted pane alone, and 3D brings its globe back', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: BOOT_TIMEOUT });

  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Split View' }).first().click();
  await page.getByText('Enable Split View').click();
  await page.waitForFunction(() => !!window.__viewtopiaPaneMap, null, { timeout: 30000 });
  // the panel docks over the right pane, so it goes before the pane is clicked
  await page.keyboard.press('Escape');

  const leftPane = page.getByTestId('viewer-pane-left');
  const rightPane = page.getByTestId('viewer-pane-right');
  const tab2d = page.getByRole('tab', { name: '2D Map' });
  const tab3d = page.getByRole('tab', { name: '3D Globe' });

  await rightPane.click();
  await tab2d.click();
  await expect(tab2d).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => paneLeafletUp(page, 1), { timeout: 30000 }).toBe(true);
  await expect(rightPane.locator('#leaflet-pane-1')).toBeVisible();
  await expect(leftPane.locator('#maplibre-container canvas')).toBeVisible();
  await expect(leftPane.locator('#leaflet-container')).toBeHidden();
  // the panes still divide the area rather than one filling it
  const [leftBox, rightBox] = [await leftPane.boundingBox(), await rightPane.boundingBox()];
  expect(rightBox.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width - 2);

  await tab3d.click();
  await expect(tab3d).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => paneLeafletUp(page, 1), { timeout: 30000 }).toBe(false);
  await page.waitForFunction(() => !!window.__viewtopiaPaneMap, null, { timeout: 30000 });
  await expect(rightPane.locator('canvas')).toHaveCount(1);

  // the viewer pane goes 2D in its own half, and the pane beside it stays
  await leftPane.click();
  await tab2d.click();
  await expect(leftPane.locator('#leaflet-container')).toBeVisible();
  await expect(rightPane.locator('canvas')).toHaveCount(1);
  const areaWidth = (await page.locator('#react-root').boundingBox()).width;
  expect((await leftPane.boundingBox()).width).toBeLessThan(areaWidth * 0.6);

  // the tab reads per pane: the right one is still on 3D
  await rightPane.click();
  await expect(tab3d).toHaveAttribute('aria-selected', 'true');
});
