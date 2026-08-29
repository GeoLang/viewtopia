import { test, expect } from './console-guard';

/**
 * A terrain action run from chat-only mode, with no model and no tiletopia: a
 * stored reply carrying the viewer command is replayed by clicking it, the same
 * path a live reply takes, and the analysis POST is answered by a route mock.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-actions-terrain.spec.js
 */

const CHAT_URL = '/?mode=chat';

/** tiletopia's answer: one square of visible ground around the observer. */
const VISIBLE_SQUARE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { visible_cells: 4 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.105, 51.495],
            [-0.095, 51.495],
            [-0.095, 51.505],
            [-0.105, 51.505],
            [-0.105, 51.495],
          ],
        ],
      },
    },
  ],
};

const SESSION = {
  id: 'chat-terrain-e2e',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'what can I see from here?', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Working out the viewshed.',
      timestamp: 2,
      viewerCmds: [
        {
          action: 'run',
          params: {
            name: 'analysis.viewshed',
            args: { lon: -0.1, lat: 51.5, height_m: 10, radius_m: 2500 },
          },
        },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

/** The viewshed result, drawn like any other layer the chat can also reach. */
const VIEWSHED_SOURCE = 'agent-layer-viewshed-result';

const resultLayerIds = (page) =>
  page.evaluate((source) => {
    const map = window.__viewtopiaMap;
    if (!map) return [];
    return (map.getStyle()?.layers ?? [])
      .map((layer) => layer.id)
      .filter((id) => id.startsWith(source));
  }, VIEWSHED_SOURCE);

test('a chat viewshed draws its result on the live map', async ({ page }) => {
  await page.route('**/tiles/v1/analysis/viewshed', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(VISIBLE_SQUARE) }),
  );
  await page.addInitScript((session) => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
    // the dark style is the one served from disk, so MapLibre has real layers
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { basemap: 'dark', renderer: 'maplibre' }, version: 0 }),
    );
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({
        state: { sessions: [session], activeSessionId: session.id },
        version: 0,
      }),
    );
  }, SESSION);

  await page.goto(CHAT_URL);
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });
  expect(await resultLayerIds(page)).toEqual([]);

  await page.getByTitle('Click to replay this result on the map').click();

  await expect
    .poll(() => resultLayerIds(page), { timeout: 30_000 })
    .toEqual([
      `${VIEWSHED_SOURCE}-fill`,
      `${VIEWSHED_SOURCE}-line`,
      `${VIEWSHED_SOURCE}-circle`,
    ]);
});
