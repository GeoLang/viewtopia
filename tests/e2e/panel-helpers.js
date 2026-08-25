import { expect } from '@playwright/test';

/**
 * Shared pieces of the panel sweeps (panel-sweep.spec.js, plugin-sweep.spec.js).
 */

/**
 * A panel is a Paper appended next to the viewer, a right-anchored card
 * portaled into the dock column, or a modal in a portal.
 */
export const PANEL =
  'main > [class*="mantine-Paper-root"], .panel-dock [class*="mantine-Paper-root"], [class*="mantine-Modal-content"]';

/**
 * The renderer and basemap selects live in a popover behind the map-corner
 * button. Selecting an option closes it (the select's dropdown is a portal,
 * so the click lands outside the popover), so reopen before every use.
 */
export async function openBasemapRendererControl(page) {
  await page.getByRole('button', { name: 'Basemap & renderer' }).click();
}

export const MENU_ITEM = '[class*="mantine-Menu-dropdown"] [class*="mantine-Menu-item"]';

/**
 * Boot the app with preview tools visible and the Cesium renderer up. The
 * shipped default is MapLibre (default-boot.spec.js covers it); these suites
 * exercise the Cesium scene surface, so they seed the persisted renderer.
 */
export async function openApp(page) {
  // this stack runs no geolang-api, so nginx answers the viewer's per-page-load
  // /agent/health probe with a 502 and chrome logs it as a console error. A 2xx is the
  // only answer it does not log, and useBackendDiscovery reads res.ok alone, so the
  // agent reads as reachable here. Only the header's sync indicator reads that.
  await page.route('**/agent/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"stubbed"}' }),
  );

  // sibyl's session endpoints, which a send attaches to before its run. Same
  // reason as above: unstubbed they are 502s, and the console guard counts those.
  await page.route('**/agent/sessions**', (route) => {
    if (route.request().url().endsWith('/sessions/new')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"id":"e2e-session","name":"Session 1"}',
      });
    }
    // switch, rename and delete answer no content
    return route.fulfill({ status: 204 });
  });

  // same reason for the Settings panel's model list: without this the 502 is a
  // console error in every test that opens the panel. An empty list is what a
  // stack with no agent service really offers, and the section reads Unavailable.
  await page.route('**/agent/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"active":null,"profiles":[]}',
    }),
  );

  // the notifications bell polls this whenever a test signs in, and these
  // suites seed tokens agora's secret never signed, so the real answer is a
  // 401 chrome logs as a console error. No mentions is the honest stub.
  await page.route('**/agora/notifications', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  await page.addInitScript(() => {
    // zustand/persist store for useAppStore ('viewtopia-app'); merge() backfills
    // every key we leave out
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({
        state: { renderer: 'cesium', settings: { showPreviewTools: true } },
        version: 0,
      }),
    );
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analysis' })).toBeVisible();
  // let the seeded Cesium renderer finish booting, so its errors land in no
  // test but this one and panels that read the live viewer see it
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60000 });
}
