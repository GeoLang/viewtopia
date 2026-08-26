import { test, expect } from './console-guard';

/**
 * A travel-time prompt answered without a model or a routing service: the
 * stored reply carries the viewer command, clicking it replays the same path a
 * live reply takes, and itinera's isochrone route is mocked.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-actions-scene.spec.js
 */

const CHAT_URL = '/?mode=chat';
const SERVICE_AREA_LAYER = 'travel-time-service-area';

/** a square ring itinera leaves open, in its own [lat, lon] order */
const BOUNDARY = [
  [45.5, -73.6],
  [45.5, -73.5],
  [45.6, -73.5],
  [45.6, -73.6],
];

const SESSION = {
  id: 'chat-actions-scene-e2e',
  name: 'Session 1',
  messages: [
    {
      id: 'u1',
      role: 'user',
      content: 'how far can I drive from the old port in 5 and 10 minutes',
      timestamp: 1,
    },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Drawing the bands.',
      timestamp: 2,
      viewerCmds: [
        {
          action: 'run',
          params: {
            name: 'analysis.travel_time',
            args: { lon: -73.55, lat: 45.55, bands: '5, 10' },
          },
        },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const snapshot = (page) => page.evaluate(() => window.__viewtopiaSnapshot());

test.beforeEach(async ({ page }) => {
  await page.route('**/api/isochrone*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reachable_nodes: 42, boundary: BOUNDARY }),
    }),
  );
  await page.addInitScript((session) => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({
        state: { sessions: [session], activeSessionId: session.id },
        version: 0,
      }),
    );
  }, SESSION);
});

test('a travel-time prompt draws its bands and says how big each one is', async ({ page }) => {
  await page.goto(CHAT_URL);
  await page.waitForFunction(() => !!window.__viewtopiaSnapshot, null, { timeout: 60_000 });
  expect((await snapshot(page)).layers.map((layer) => layer.id)).not.toContain(SERVICE_AREA_LAYER);

  await page.getByTitle('Click to replay this result on the map').click();

  await expect
    .poll(async () => (await snapshot(page)).layers.map((layer) => layer.name), { timeout: 30_000 })
    .toContain('Service area (car)');
  await expect(page.getByText('By car from -73.5500, 45.5500: 5 min')).toBeVisible();
  await expect(page.getByText('10 min 8658.56 ha.')).toBeVisible();
});
