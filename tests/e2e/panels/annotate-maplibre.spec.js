import { test, expect } from '../console-guard';
import { MENU_ITEM, openApp, openBasemapRendererControl } from '../panel-helpers.js';

/**
 * Annotations with MapLibre as the displayed renderer. The panel used to bind
 * the click and draw the pin through Cesium alone, so here "Place on map" only
 * answered "No active viewer" and nothing was ever drawn.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/annotate-maplibre.spec.js
 */

/** Small area near Monaco, so a canvas click lands on ground rather than sky. */
const VIEW = { lon: 7.425, lat: 43.735, zoom: 13 };

/** Where on the map canvas the annotation goes. */
const CLICK_AT = { x: 240, y: 180 };

async function useMapLibre(page) {
  await openBasemapRendererControl(page);
  await page.getByRole('textbox', { name: 'Renderer' }).click();
  await page.getByRole('option', { name: 'MapLibre' }).click();
  await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, { timeout: 60000 });
  await page.evaluate(
    (v) => window.__viewtopiaMap.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom }),
    VIEW,
  );
}

test('annotate: place on map drops a labelled marker on MapLibre', async ({ page }) => {
  await openApp(page);
  await useMapLibre(page);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Annotate' }).first().click();
  await page.getByPlaceholder('Annotation label…').fill('Site A');
  await page.getByRole('button', { name: 'Place on map' }).click();

  await expect(page.getByTestId('annotate-status')).toHaveText('Click the map to place');
  await expect(page.getByText('No active viewer')).toHaveCount(0);

  const canvas = page.locator('#maplibre-container canvas').first();
  await canvas.click({ position: CLICK_AT });

  await expect(page.getByTestId('annotate-count')).toHaveText('1');
  const marker = page.getByTestId('annotation-marker');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveText('Site A');
  await expect(page.getByTestId('annotate-status')).toHaveText(/^Placed at /);

  // the annotation sits where the click did, not at the camera centre
  const expected = await page.evaluate(
    (at) => window.__viewtopiaMap.unproject([at.x, at.y]),
    CLICK_AT,
  );
  const [placed] = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('viewtopia-annotations')),
  );
  expect(placed.lng).toBeCloseTo(expected.lng, 4);
  expect(placed.lat).toBeCloseTo(expected.lat, 4);
  expect(placed.lng).not.toBeCloseTo(VIEW.lon, 4);
});
