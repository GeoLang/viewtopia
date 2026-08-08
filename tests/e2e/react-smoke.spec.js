import { test, expect } from './console-guard';

/**
 * React front-end smoke test (Track 2 verification harness).
 *
 * Loads the React app (index.html) and asserts it mounts and renders its
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

const REACT_URL = '/';

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
    const toggle = page.getByLabel('Click a feature to inspect');
    // Inspect is the picking mode itself, so opening it arms the picker.
    await expect(toggle).toBeChecked();
    // Mantine hides the real <input>; toggle via its visible label.
    await page.getByText('Click a feature to inspect').click();
    await expect(toggle).not.toBeChecked();
  });

  test('GeoJSON editor opens with its empty state', async ({ page }) => {
    await page.goto(REACT_URL);
    const editor = page.getByRole('button', { name: 'GeoJSON Editor' });
    await expect(editor).toBeVisible();
    await editor.click();
    // Panel renders its heading + the no-features empty state (nothing drawn yet).
    await expect(page.getByText('GeoJSON Editor').first()).toBeVisible();
    await expect(page.getByText(/no features yet/i)).toBeVisible();
  });

  test('style editor opens with its controls', async ({ page }) => {
    await page.goto(REACT_URL);
    const style = page.getByRole('button', { name: 'Style Editor' });
    await expect(style).toBeVisible();
    await style.click();
    // Panel renders its heading + the color-by-property control.
    await expect(page.getByText('Style Editor').first()).toBeVisible();
    await expect(page.getByText('Color by Property')).toBeVisible();
  });

  test('theme toggle switches and persists the color scheme', async ({ page }) => {
    await page.goto(REACT_URL);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
    // Mantine persists the choice to localStorage — survives a reload.
    await page.reload();
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
  });

  test('auth modal opens and switches between login / register', async ({ page }) => {
    await page.goto(REACT_URL);
    // Header trigger (aria-label "Login") opens the modal while logged out.
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByLabel('Email or username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use API Key' })).toBeVisible();
    // Switch to the register view → confirm-password field appears.
    await page.getByText('Create account').click();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });

  test('portal catalog opens from the Data menu', async ({ page }) => {
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Data' }).click();
    await page.getByText('🗂 Catalog').click();
    // Modal renders with search + the signed-out state (no token, so the catalog
    // is never requested).
    await expect(page.getByText('Content Catalog')).toBeVisible();
    await expect(page.getByPlaceholder('Search items…')).toBeVisible();
    await expect(page.getByTestId('portal-signin')).toBeVisible();
  });

  test('fly-to box accepts a location without runtime errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    const box = page.getByPlaceholder('Fly to place…');
    await expect(box).toBeVisible();
    // Raw coordinates take the direct path (no network); Enter flies the camera.
    await box.fill('51.5, -0.12');
    await box.press('Enter');
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('MapLibre renderer activates with the deck.gl overlay on it', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(REACT_URL);
    // Switch renderer Cesium → MapLibre via the map-corner control's Select.
    await page.getByRole('button', { name: 'Basemap & renderer' }).click();
    await page.locator('input[aria-label="Renderer"]').click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await expect(page.locator('#maplibre-container canvas').first()).toBeVisible({
      timeout: 10000,
    });
    // deck.gl has no renderer of its own: it interleaves into that map
    await page.waitForFunction(() => !!window.__viewtopiaDeck, null, { timeout: 30000 });
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('dashboards: create one and add a widget', async ({ page }) => {
    // Start clean so the empty-state + create flow is deterministic.
    await page.addInitScript(() => localStorage.removeItem('viewtopia_dashboards'));
    await page.goto(REACT_URL);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByText('📈 Dashboards').click();
    await expect(page.getByText(/no dashboards yet/i)).toBeVisible();
    // Create → enters the editor view.
    await page.getByRole('button', { name: 'New Dashboard' }).click();
    await expect(page.getByText(/no widgets yet/i)).toBeVisible();
    // Add a widget via the picker.
    await page.getByRole('button', { name: 'Widget', exact: true }).click();
    await page.getByRole('button', { name: /Indicator/ }).click();
    await expect(page.getByText('New indicator')).toBeVisible();
    // Add a chart widget and confirm it renders a real svg, not placeholder text.
    await page.getByRole('button', { name: 'Widget', exact: true }).click();
    await page.getByRole('button', { name: /Chart/ }).click();
    await expect(page.getByText('New chart')).toBeVisible();
    await expect(page.locator('svg[aria-label$="chart"]')).toBeVisible();
    await expect(page.getByText('[Chart: bar]')).toHaveCount(0);
  });
});
