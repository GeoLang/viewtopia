import { test, expect } from '../console-guard';
import { PANEL, MENU_ITEM, openApp } from '../panel-helpers';

/**
 * Functional smoke for the More menu panels against the live platform stack.
 * Each test opens the panel from the menu, drives its primary control and reads
 * the effect back out of the document, the persisted store or the live camera.
 *
 * Run: npx playwright test -c playwright.panels.config.js tests/e2e/panels/more.spec.js
 */

/**
 * Camera stop the share link has to encode. heading and pitch differ in sign and
 * magnitude, so a swap between them shows up in the restored camera.
 */
const MONACO = { lon: 7.42, lat: 43.73, height: 12000, heading: 45, pitch: -30 };

/** What geolang-api answers on /agent/models; this stack runs no agent service. */
const MODELS = {
  active: 'local',
  profiles: [
    { id: 'cloud', label: 'Grok (cloud)', model: 'grok-4-1-fast-reasoning', available: true },
    {
      id: 'local',
      label: 'Local (Qwen3.5-9B-Q4_K_M)',
      model: 'Qwen3.5-9B-Q4_K_M',
      available: true,
    },
  ],
};

/** Point the Cesium camera at a lon/lat/height with an orientation. */
const setView = (page, view) =>
  page.evaluate((v) => {
    const viewer = window.__viewtopiaViewer;
    const rad = (d) => (d * Math.PI) / 180;
    viewer.camera.cancelFlight();
    viewer.camera.setView({
      destination: viewer.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: rad(v.lon),
        latitude: rad(v.lat),
        height: v.height,
      }),
      orientation: { heading: rad(v.heading), pitch: rad(v.pitch), roll: 0 },
    });
  }, view);

/** Where the live Cesium camera sits, in degrees and metres. */
const liveCamera = (page) =>
  page.evaluate(() => {
    const { camera } = window.__viewtopiaViewer;
    const deg = (r) => (r * 180) / Math.PI;
    return {
      lon: deg(camera.positionCartographic.longitude),
      lat: deg(camera.positionCartographic.latitude),
      height: camera.positionCartographic.height,
      heading: deg(camera.heading),
      pitch: deg(camera.pitch),
    };
  });

/** The five cam numbers and the renderer out of a share url hash. */
function parseShareUrl(value) {
  const params = new URLSearchParams(new URL(value).hash.slice(1));
  const [lon, lat, height, heading, pitch] = params.get('cam').split(',').map(Number);
  return { lon, lat, height, heading, pitch, renderer: params.get('renderer') };
}

/** Settings the app persisted under the zustand key. */
const persistedSettings = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('viewtopia-app')).state.settings);

async function openPanel(page, label, match) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  // the dropdown overlays the panel, so a click can land on a menu item instead
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: match });
  await expect(panel).toHaveCount(1);
  return panel;
}

async function closePanel(page, panel) {
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
}

test.describe('More menu panels', () => {
  test('settings: display switch removes the minimap and persists', async ({ page }) => {
    await openApp(page);

    // the overview map is the only Leaflet instance while the globe tab is up
    const minimap = page.locator('.leaflet-container:not(#leaflet-container)');
    await expect(minimap).toHaveCount(1);
    expect((await persistedSettings(page)).showMinimap).toBe(true);

    const panel = await openPanel(page, 'Settings', 'Settings');

    await panel.getByText('Show Minimap').click();

    // the widget unmounts and the choice survives in the persisted store
    await expect(minimap).toHaveCount(0);
    await expect
      .poll(async () => (await persistedSettings(page)).showMinimap)
      .toBe(false);

    // switching it back rebuilds the widget, so the toggle drives both directions
    await panel.getByText('Show Minimap').click();
    await expect(minimap).toHaveCount(1);
    await expect
      .poll(async () => (await persistedSettings(page)).showMinimap)
      .toBe(true);

    await closePanel(page, panel);
    // closing does not undo the change
    await expect(minimap).toHaveCount(1);
  });

  test('settings: the ai model select switches the agent model', async ({ page }) => {
    await openApp(page);

    // registered after openApp so these win over its empty-list stub, and before
    // the panel mounts, which is when it reads the list
    const switched = [];
    await page.route('**/agent/models', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MODELS) }),
    );
    await page.route('**/agent/model', async (route) => {
      switched.push(JSON.parse(route.request().postData()));
      await route.fulfill({ status: 204 });
    });

    const panel = await openPanel(page, 'Settings', 'Settings');

    // the section opens on whatever the backend calls active
    const select = panel.getByTestId('ai-model-select');
    await expect(select).toHaveValue('Local (Qwen3.5-9B-Q4_K_M)');
    await expect(panel).toContainText('applies to new messages only');

    await select.click();
    await page.getByRole('option', { name: 'Grok (cloud)' }).click();

    // the choice reaches the backend and the control keeps it
    await expect.poll(() => switched).toEqual([{ id: 'cloud' }]);
    await expect(select).toHaveValue('Grok (cloud)');
    await expect(panel.getByTestId('ai-model-error')).toHaveCount(0);

    await closePanel(page, panel);
  });

  test('shareLink: generated url carries the live camera and renderer', async ({ page }) => {
    await openApp(page);
    await setView(page, MONACO);

    const panel = await openPanel(page, 'Share Link', 'Share Link');
    const url = panel.getByTestId('sharelink-url');
    await expect(url).toHaveCount(0);

    await panel.getByRole('button', { name: 'Generate Share Link' }).click();

    await expect(url).toHaveValue(/#cam=/);
    const value = await url.inputValue();
    const cesiumLink = parseShareUrl(value);
    expect(cesiumLink.lon).toBeCloseTo(MONACO.lon, 1);
    expect(cesiumLink.lat).toBeCloseTo(MONACO.lat, 1);
    expect(cesiumLink.height).toBeCloseTo(MONACO.height, -2);
    expect(cesiumLink.heading).toBeCloseTo(MONACO.heading, 1);
    expect(cesiumLink.pitch).toBeCloseTo(MONACO.pitch, 1);
    expect(cesiumLink.renderer).toBe('cesium');

    // copy hands the same string to the clipboard and flips the button icon
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await panel.getByRole('button', { name: 'Copy link' }).click();
    await expect(panel.locator('.tabler-icon-check')).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(value);

    await closePanel(page, panel);

    // the camera and the renderer field both have to follow the renderer on
    // screen, so switch it, put that map somewhere else and regenerate: the link
    // must carry the MapLibre camera, not the Cesium one it replaced
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'MapLibre' }).click();
    await page.waitForFunction(() => window.__viewtopiaMap?.isStyleLoaded(), null, {
      timeout: 60000,
    });
    const mapView = { lon: -73.98, lat: 40.75, zoom: 12, pitch: 55, bearing: 20 };
    await page.evaluate(
      (v) =>
        window.__viewtopiaMap.jumpTo({
          center: [v.lon, v.lat],
          zoom: v.zoom,
          pitch: v.pitch,
          bearing: v.bearing,
        }),
      mapView,
    );

    const mapPanel = await openPanel(page, 'Share Link', 'Share Link');
    await mapPanel.getByRole('button', { name: 'Generate Share Link' }).click();
    const mapValue = await mapPanel.getByTestId('sharelink-url').inputValue();
    expect(mapValue).not.toBe(value);
    const mapLink = parseShareUrl(mapValue);
    expect(mapLink.renderer).toBe('maplibre');
    expect(mapLink.lon).toBeCloseTo(mapView.lon, 3);
    expect(mapLink.lat).toBeCloseTo(mapView.lat, 3);
    // zoom becomes the camera height the hash format carries, and MapLibre's
    // map-style pitch becomes the Cesium one the link restores
    expect(mapLink.height).toBeCloseTo(4e7 / 2 ** mapView.zoom, -1);
    expect(mapLink.heading).toBeCloseTo(mapView.bearing, 3);
    expect(mapLink.pitch).toBeCloseTo(mapView.pitch - 90, 3);
    await closePanel(page, mapPanel);

    // back on Cesium the link is the Cesium camera again
    await page.getByRole('textbox', { name: 'Renderer' }).click();
    await page.getByRole('option', { name: 'CesiumJS' }).click();
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });
    await setView(page, MONACO);
    const backPanel = await openPanel(page, 'Share Link', 'Share Link');
    await backPanel.getByRole('button', { name: 'Generate Share Link' }).click();
    const backLink = parseShareUrl(await backPanel.getByTestId('sharelink-url').inputValue());
    expect(backLink.renderer).toBe('cesium');
    expect(backLink.lon).toBeCloseTo(MONACO.lon, 1);
    expect(backLink.pitch).toBeCloseTo(MONACO.pitch, 1);
    await closePanel(page, backPanel);

    // opening the cesium link restores the camera it encoded. a hash-only
    // navigation stays in the same document, so reload to remount the app on it
    await page.goto(value);
    await page.reload();
    await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });
    await expect
      .poll(async () => (await liveCamera(page)).heading, { timeout: 30000 })
      .toBeCloseTo(MONACO.heading, 0);
    const restored = await liveCamera(page);
    expect(restored.pitch).toBeCloseTo(MONACO.pitch, 0);
    expect(restored.lon).toBeCloseTo(MONACO.lon, 1);
    expect(restored.lat).toBeCloseTo(MONACO.lat, 1);
    expect(restored.height).toBeCloseTo(MONACO.height, -2);
  });

  test('tour: stepping moves the highlight onto the next target', async ({ page }) => {
    await openApp(page);

    // the tour retitles itself per step, so match on the step badge instead
    const panel = await openPanel(page, 'Tour', /[1-5]\/5/);
    await expect(panel).toContainText('Welcome to ViewTopia');
    await expect(panel).toContainText('1/5');

    const outline = (selector) =>
      page.evaluate((s) => document.querySelector(s)?.style.outline ?? null, selector);

    /** The violet highlight is on this element. */
    const highlighted = async (selector) => {
      const value = await outline(selector);
      return value.includes('2px') && value.includes('rgb(167, 139, 250)');
    };

    const globe = '#cesium-container';
    const chat = '.mantine-AppShell-aside';
    const header = '.mantine-AppShell-header';
    const tabs = '.mantine-Tabs-list';

    // every step aims at an element this build renders, starting with the header
    await expect.poll(() => highlighted(header)).toBe(true);

    await panel.getByRole('button', { name: 'Next' }).click();
    await expect(panel).toContainText('Viewer Tabs');
    await expect(panel).toContainText('2/5');
    await expect.poll(() => highlighted(tabs)).toBe(true);
    expect(await outline(header)).toBe('');

    await panel.getByRole('button', { name: 'Next' }).click();
    await expect(panel).toContainText('3D Globe');
    await expect(panel).toContainText('3/5');
    await expect.poll(() => outline(globe)).toContain('2px');
    expect(await outline(globe)).toContain('rgb(167, 139, 250)');
    // one target at a time
    expect(await highlighted(chat)).toBe(false);
    expect(await outline(tabs)).toBe('');

    // step 4 targets the chat panel: it gains the outline as the globe loses it
    await panel.getByRole('button', { name: 'Next' }).click();
    await expect(panel).toContainText('Chat Panel');
    await expect(panel).toContainText('4/5');
    await expect.poll(() => highlighted(chat)).toBe(true);
    expect(await outline(globe)).toBe('');

    // Back walks the highlight the same way in reverse
    await panel.getByRole('button', { name: 'Back' }).click();
    await expect(panel).toContainText('3/5');
    await expect.poll(() => highlighted(globe)).toBe(true);
    expect(await outline(chat)).toBe('');

    // closing drops the highlight the live step had put on the globe
    await closePanel(page, panel);
    await expect.poll(() => outline(globe)).toBe('');
  });
});
