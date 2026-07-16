import { test, expect } from '@playwright/test';

/**
 * Tool state across renderer switches.
 *
 * Each renderer switch destroys and rebuilds the viewer, so any hook keyed only
 * on its ref never re-runs: its features stay on the dead instance and its input
 * handlers go quietly dead. This pins the draw tool against that.
 *
 * Run: npm run test:e2e:react
 */

const REACT_URL = '/';

const drawEntityCount = (page) =>
  page.evaluate(() => {
    const v = window.__viewtopiaViewer;
    if (!v || v.isDestroyed?.()) return -1;
    return v.entities.values.filter((e) => String(e.id).startsWith('draw-')).length;
  });

async function switchRenderer(page, label) {
  await page
    .locator('input[value="CesiumJS"], input[value="deck.gl"], input[value="MapLibre"]')
    .first()
    .click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Canvas centre, offset in pixels, in page coordinates. */
const canvasPoint = (page, dx, dy) =>
  page.evaluate(
    ([dx, dy]) => {
      const v = window.__viewtopiaViewer;
      if (!v || v.isDestroyed?.()) return null;
      const r = v.scene.canvas.getBoundingClientRect();
      return { x: r.x + r.width / 2 + dx, y: r.y + r.height / 2 + dy };
    },
    [dx, dy],
  );

test.describe('draw tool across renderers', () => {
  test('drawn features survive a cesium → deck.gl → cesium round trip', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });

    await page.getByRole('button', { name: 'Draw' }).click();
    await page.getByText('Point', { exact: true }).click();

    for (const [dx, dy] of [
      [0, 0],
      [40, 30],
    ]) {
      const pt = await canvasPoint(page, dx, dy);
      await page.mouse.click(Math.round(pt.x), Math.round(pt.y));
    }
    await expect.poll(() => drawEntityCount(page), { timeout: 15000 }).toBe(2);

    // The viewer is rebuilt on each switch; the entities went with the old one.
    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await switchRenderer(page, 'CesiumJS');
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 30000 });

    await expect.poll(() => drawEntityCount(page), { timeout: 30000 }).toBe(2);
  });

  test('the draw handler rebinds to the rebuilt viewer', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });

    await page.getByRole('button', { name: 'Draw' }).click();
    await page.getByText('Point', { exact: true }).click();

    // The crosshair is set when the handler binds, so it stands in for "armed".
    const cursor = () =>
      page.evaluate(() => {
        const v = window.__viewtopiaViewer;
        return v && !v.isDestroyed?.() ? v.scene.canvas.style.cursor : '<none>';
      });
    await expect.poll(cursor, { timeout: 15000 }).toBe('crosshair');

    await switchRenderer(page, 'deck.gl');
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    await switchRenderer(page, 'CesiumJS');
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 30000 });

    // Draw mode was already on, so the store never fires again — the hook has to
    // apply the current mode itself when it rebinds.
    await expect.poll(cursor, { timeout: 30000 }).toBe('crosshair');
  });
});
