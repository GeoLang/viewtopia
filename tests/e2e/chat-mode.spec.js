import { test, expect } from './console-guard';

/**
 * Chat-only mode with no model in the loop: a stored reply carrying viewer
 * commands is replayed by clicking it, the same path a live reply takes.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-mode.spec.js
 */

const CHAT_URL = '/?mode=chat';

/** A session whose one reply ran an action and a panel command, ready to replay. */
const SESSION = {
  id: 'chat-mode-e2e',
  name: 'Session 1',
  messages: [
    { id: 'u1', role: 'user', content: 'make the basemap dark and show me a viewshed', timestamp: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Switching the basemap.',
      timestamp: 2,
      viewerCmds: [
        { action: 'run', params: { name: 'basemap.set', args: { basemap: 'dark' } } },
        { action: 'viewshed' },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const snapshot = (page) => page.evaluate(() => window.__viewtopiaSnapshot());

test.beforeEach(async ({ page }) => {
  await page.addInitScript((session) => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
    // the replay has to change something, so start on a basemap it is not
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

test('chat mode drops the chrome and keeps the chat', async ({ page }) => {
  await page.goto(CHAT_URL);
  await page.waitForFunction(() => !!window.__viewtopiaSnapshot, null, { timeout: 60_000 });

  // the header is collapsed by a transform, so it still has a box: it sits
  // above the top of the page rather than being display:none
  const header = await page.locator('header').first().boundingBox();
  expect(header.y + header.height).toBeLessThanOrEqual(0);

  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
  await expect(page.getByLabel('Exit chat mode')).toBeVisible();
  expect((await snapshot(page)).mode).toBe('chat');
});

test('a replayed reply runs its action and opens the panel it names', async ({ page }) => {
  await page.goto(CHAT_URL);
  await page.waitForFunction(() => !!window.__viewtopiaSnapshot, null, { timeout: 60_000 });
  expect((await snapshot(page)).basemap).toBe('osm');

  await page.getByTitle('Click to replay this result on the map').click();

  await expect.poll(async () => (await snapshot(page)).basemap, { timeout: 30_000 }).toBe('dark');
  // the toolbars stay hidden, the panel the chat opened is drawn
  await expect(page.getByText('Viewshed Analysis')).toBeVisible();
  await expect(page.getByLabel('Exit chat mode')).toBeVisible();

  await page.getByLabel('Exit chat mode').click();
  await expect(page.getByLabel('Exit chat mode')).toHaveCount(0);
  await expect(page.getByText('Viewshed Analysis')).toBeVisible();
});
