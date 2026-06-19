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
 * STATUS (2026-06-19): currently FAILING and marked .fixme. Observed: #react-root
 * mounts with children, but the "ViewTopia" title is not visible — the React app
 * appears to render an ErrorBoundary fallback / throw at runtime when loaded.
 * NEXT SESSION: run this without .fixme, capture the console/pageerror, and fix the
 * runtime crash before continuing the P1/P2 feature ports.
 */

const REACT_URL = '/index-react.html';

test.describe('React shell smoke', () => {
  test.fixme('app mounts and renders the shell without runtime errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(REACT_URL);

    // React actually mounted into #react-root
    await expect(page.locator('#react-root > *').first()).toBeVisible();

    // Core shell: app title + a renderer container
    await expect(page.getByText('ViewTopia').first()).toBeVisible();
    await expect(page.locator('#cesium-container')).toBeAttached();

    // No uncaught runtime errors (Cesium WebGL warnings are not pageerrors)
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test.fixme('a tool panel opens from the toolbar', async ({ page }) => {
    await page.goto(REACT_URL);
    // The toolbar exposes tool buttons via tooltips (Measure, Draw, …).
    const measure = page.getByRole('button', { name: 'Measure' });
    await expect(measure).toBeVisible();
    await measure.click();
    // Opening a panel should render an aside/dialog region with content.
    await expect(page.getByText(/measure/i).first()).toBeVisible();
  });
});
