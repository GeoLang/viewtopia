import { test, expect } from './console-guard';

/**
 * Chat-only mode importing a file with no mouse: a stored reply carrying the
 * data.import_url command is replayed by clicking it, the same path a live
 * reply takes, and the file it names is served from the page's own origin.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-actions-data.spec.js
 */

const CHAT_URL = '/?mode=chat';
const FILE_URL = '/e2e-roads.geojson';

const ROADS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [7.4, 46.9],
          [7.5, 47.0],
        ],
      },
      properties: { name: 'Bahnhofstrasse' },
    },
  ],
};

/** A session whose one reply imports the file, ready to replay. */
const SESSION = {
  id: 'chat-actions-data-e2e',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: `import ${FILE_URL}`, timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Importing the roads.',
      timestamp: 2,
      viewerCmds: [{ action: 'run', params: { name: 'data.import_url', args: { url: FILE_URL } } }],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const snapshot = (page) => page.evaluate(() => window.__viewtopiaSnapshot());

test.beforeEach(async ({ page }) => {
  await page.route(`**${FILE_URL}`, (route) =>
    route.fulfill({ contentType: 'application/geo+json', body: JSON.stringify(ROADS) }),
  );
  await page.addInitScript((session) => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { basemap: 'osm', renderer: 'maplibre' }, version: 0 }),
    );
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({
        state: { sessions: [session], activeSessionId: session.id },
        version: 0,
      }),
    );
  }, SESSION);
});

test('a replayed reply imports a URL onto the map', async ({ page }) => {
  await page.goto(CHAT_URL);
  await page.waitForFunction(() => !!window.__viewtopiaSnapshot, null, { timeout: 60_000 });
  expect((await snapshot(page)).layers).toEqual([]);

  await page.getByTitle('Click to replay this result on the map').click();

  await expect
    .poll(async () => (await snapshot(page)).layers.map((layer) => layer.name), { timeout: 30_000 })
    .toEqual(['e2e-roads.geojson']);
  await expect(page.getByText('e2e-roads.geojson: 1 features')).toBeVisible();
});
