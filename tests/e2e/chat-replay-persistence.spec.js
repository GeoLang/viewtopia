import { test, expect } from './console-guard';

/**
 * Two things the chat has to keep straight with no model on the line: replaying
 * a stored reply draws it again and says nothing about it, and what the viewer
 * was showing comes back after a reload.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-replay-persistence.spec.js
 */

const BOOT_TIMEOUT = 60_000;
const SETTLE_TIMEOUT = 30_000;

const FRANCE = { lon: 2.2, lat: 46.6 };

/** A session whose one reply flies the camera, ready to replay. */
const SESSION = {
  id: 'chat-replay-persistence-e2e',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'take me to France', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Flying to France.',
      timestamp: 2,
      viewerCmds: [{ action: 'run', params: { name: 'camera.fly_to', args: FRANCE } }],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const runAction = (page, name, args) =>
  page.evaluate(([name, args]) => window.__viewtopiaRunAction({ name, args }), [name, args]);

const maplibreCentre = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaMap;
    if (!map) return null;
    const centre = map.getCenter();
    return { lat: centre.lat, lng: centre.lng };
  });

const near = (centre, target) =>
  !!centre && Math.abs(centre.lat - target.lat) < 0.05 && Math.abs(centre.lng - target.lon) < 0.05;

/** The XYZ template the leaflet map is drawing tiles from. */
const leafletTileTemplate = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaLeaflet;
    if (!map) return null;
    let template = null;
    map.eachLayer((layer) => {
      if (layer._url) template = layer._url;
    });
    return template;
  });

/** One paragraph per chat line, which is what a replay must not add to. */
const chatLines = (page) =>
  page.locator('aside [class*="mantine-ScrollArea-viewport"] p').count();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
  });
});

test('a replayed reply moves the map and adds no chat line', async ({ page }) => {
  await page.addInitScript((session) => {
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({ state: { sessions: [session], activeSessionId: session.id }, version: 0 }),
    );
  }, SESSION);

  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: BOOT_TIMEOUT });
  await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();

  const linesBefore = await chatLines(page);
  expect(linesBefore).toBe(SESSION.messages.length);
  expect(near(await maplibreCentre(page), FRANCE)).toBe(false);

  await page.getByTitle('Click to replay this result on the map').click();

  await expect
    .poll(async () => near(await maplibreCentre(page), FRANCE), { timeout: SETTLE_TIMEOUT })
    .toBe(true);
  expect(await chatLines(page)).toBe(linesBefore);
});

test('the tab, renderer, basemap and chat pane come back after a reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaRunAction, null, { timeout: BOOT_TIMEOUT });
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: BOOT_TIMEOUT });

  // renderer.set shows the globe tab, so the tab is set after it
  await runAction(page, 'renderer.set', { renderer: 'cesium' });
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: BOOT_TIMEOUT });
  await runAction(page, 'basemap.set', { basemap: 'satellite' });
  await runAction(page, 'view.set_tab', { tab: 'map' });
  await page.waitForFunction(() => !!window.__viewtopiaLeaflet, null, { timeout: SETTLE_TIMEOUT });
  await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();

  await page.reload();

  // the flat map tab and its basemap are back on the rebuilt leaflet map
  await page.waitForFunction(() => !!window.__viewtopiaLeaflet, null, { timeout: BOOT_TIMEOUT });
  await expect(page.locator('#leaflet-container')).toBeVisible();
  await expect
    .poll(() => leafletTileTemplate(page), { timeout: SETTLE_TIMEOUT })
    .toContain('server.arcgisonline.com');
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide chat' })).toBeVisible();

  // the globe tab draws with cesium again, which is only built once it shows
  await runAction(page, 'view.set_tab', { tab: 'globe' });
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: BOOT_TIMEOUT });
  await expect(page.locator('#cesium-container')).toBeVisible();
  await expect(page.locator('#maplibre-container')).toBeHidden();
});
