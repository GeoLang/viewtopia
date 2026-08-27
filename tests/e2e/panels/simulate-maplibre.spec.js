import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp, openBasemapRendererControl } from '../panel-helpers.js';
import { mintToken } from '../../../scripts/platform-token.mjs';

/**
 * Flood and Solar with MapLibre as the displayed renderer, against the live
 * platform stack. Both panels used to read their bbox off the Cesium viewer and
 * draw the result there, so on MapLibre they failed outright or drew where
 * nothing was visible.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/simulate-maplibre.spec.js
 */

const TOKEN = mintToken({ role: 'editor', sub: 'panels-maplibre-e2e' });

/** Small area near Monaco, so the view-derived bboxes are city sized. */
const VIEW = { lon: 7.425, lat: 43.735, zoom: 13 };

async function seedAuth(page) {
  await page.addInitScript((token) => {
    if (token) {
      localStorage.setItem(
        'viewtopia_auth',
        JSON.stringify({ user: { email: 'maplibre-e2e@viewtopia.test' }, token }),
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

/** Show MapLibre instead of Cesium, framed on VIEW. */
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

const mapLayerIds = (page, prefix) =>
  page.evaluate((p) => {
    const m = window.__viewtopiaMap;
    if (!m) return null;
    return (m.getStyle()?.layers ?? []).map((l) => l.id).filter((id) => id.startsWith(p));
  }, prefix);

/** The bbox a result was drawn over, next to the bounds the map is showing. */
const drapedOverView = (page, source) =>
  page.evaluate((s) => {
    const m = window.__viewtopiaMap;
    const b = m.getBounds();
    const round = (v) => Math.round(v * 1000) / 1000;
    const [[west, north], , [east, south]] = m.getStyle().sources[s].coordinates;
    return {
      drawn: [west, south, east, north].map(round),
      view: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(round),
    };
  }, source);

/** The flood result, drawn like any other layer the chat can also reach. */
const FLOOD_SOURCE = 'agent-layer-flood-result';

test.describe('Simulate panels on MapLibre', () => {
  test.describe.configure({ mode: 'parallel' });

  test('flood: the flooded area draws on the MapLibre map', async ({ page }) => {
    await seedAuth(page);
    await openApp(page);
    await useMapLibre(page);
    const panel = await openPanel(page, 'Flood', 'Flood Simulation');

    expect(await mapLayerIds(page, FLOOD_SOURCE)).toEqual([]);
    await panel.getByRole('button', { name: 'Simulate' }).click();

    const cells = panel.getByText(/flooded cell/);
    await expect(cells).toBeVisible({ timeout: 60000 });
    expect(Number(/\d+/.exec(await cells.textContent())[0])).toBeGreaterThan(0);
    await expect(panel.getByText('Cannot read the current map view')).toHaveCount(0);
    await expect(panel.getByText('Flood request failed')).toHaveCount(0);

    await expect
      .poll(() => mapLayerIds(page, FLOOD_SOURCE), { timeout: 60000 })
      .toEqual([
        `${FLOOD_SOURCE}-fill`,
        `${FLOOD_SOURCE}-line`,
        `${FLOOD_SOURCE}-circle`,
      ]);
    // the polygons the backend answered with, on the map's own source
    expect(
      await page.evaluate(
        (source) => window.__viewtopiaMap.getSource(source).serialize().data.features.length,
        FLOOD_SOURCE,
      ),
    ).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    // taking the result off is a store edit the map picks up when it next
    // settles, so it gets the same budget as drawing it
    await expect.poll(() => mapLayerIds(page, FLOOD_SOURCE), { timeout: 60000 }).toEqual([]);
  });

  test('solar: the irradiance raster drapes over the MapLibre view', async ({ page }) => {
    await seedAuth(page);
    await openApp(page);
    await useMapLibre(page);
    const panel = await openPanel(page, 'Solar', 'Solar Planner');

    expect(await mapLayerIds(page, 'solar-result')).toEqual([]);
    await panel.getByRole('button', { name: 'Compute' }).click();

    await expect
      .poll(() => mapLayerIds(page, 'solar-result'), { timeout: 60000 })
      .toEqual(['solar-result-raster']);
    await expect(panel.getByText('Cannot read the current map view')).toHaveCount(0);
    await expect(panel.getByText('Solar request failed')).toHaveCount(0);

    // the bbox came from the map on screen, so the PNG covers exactly its view
    const { drawn, view } = await drapedOverView(page, 'solar-result');
    expect(drawn).toEqual(view);

    // the opacity slider drives the live raster layer
    const rasterOpacity = () =>
      page.evaluate(() =>
        window.__viewtopiaMap.getPaintProperty('solar-result-raster', 'raster-opacity'),
      );
    expect(await rasterOpacity()).toBeCloseTo(0.7, 2);
    const slider = panel.locator('[role="slider"]').first();
    await slider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await expect(panel).toContainText('Opacity: 60%');
    await expect.poll(rasterOpacity).toBe(0.6);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect.poll(() => mapLayerIds(page, 'solar-result')).toEqual([]);
  });
});
