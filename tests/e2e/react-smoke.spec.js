import { test, expect } from '@playwright/test';

/**
 * React front-end smoke test (Track 2 verification harness).
 *
 * Loads the React app (index-react.html) and asserts it mounts and renders its
 * core shell without runtime errors — catching white-screen crashes that build +
 * tsc miss. This is the harness new React feature ports are verified against.
 *
 * Run: npm run test:e2e:react   (serves the app on :5175 via Vite)
 *
 * NOTE: served standalone (no platform backend), so backend probes like
 * /api/health and /agent/health return 500 and /manifest.json 404 — those are
 * expected network failures, NOT runtime errors. The gate is uncaught JS
 * exceptions (page `pageerror`), which must stay empty.
 */

const REACT_URL = '/index-react.html';

test.describe('React shell smoke', () => {
  test('app mounts and renders the shell without runtime errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(REACT_URL);

    // Core shell rendered: app title (in the header) + the Cesium renderer container.
    // (Don't assert `#react-root > *` first — Mantine injects a non-visible <style>
    // as the first child, which is never "visible".)
    await expect(page.getByText('ViewTopia').first()).toBeVisible();
    await expect(page.locator('#cesium-container')).toBeAttached();

    // No uncaught runtime errors (failed backend probes / Cesium WebGL warnings
    // are not pageerrors).
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('a tool panel opens from the toolbar', async ({ page }) => {
    await page.goto(REACT_URL);
    // Tool buttons carry an aria-label matching their tooltip (Measure, Draw, …).
    const measure = page.getByRole('button', { name: 'Measure' });
    await expect(measure).toBeVisible();
    await measure.click();
    // Opening the Measure tool renders its panel with a "Measurement" heading.
    await expect(page.getByText('Measurement').first()).toBeVisible();
  });

  test('feature picker (Inspect) opens and toggles', async ({ page }) => {
    await page.goto(REACT_URL);
    const inspect = page.getByRole('button', { name: 'Inspect' });
    await expect(inspect).toBeVisible();
    await inspect.click();
    // Panel renders with its "Feature Info" heading and the enable switch.
    await expect(page.getByText('Feature Info').first()).toBeVisible();
    const toggle = page.getByLabel('Click a 3D Tiles feature to inspect');
    await expect(toggle).not.toBeChecked();
    // Mantine hides the real <input>; toggle via its visible label.
    await page.getByText('Click a 3D Tiles feature to inspect').click();
    await expect(toggle).toBeChecked();
  });
});
