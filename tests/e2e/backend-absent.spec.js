import { allowConsoleError, test, expect } from './console-guard';
import { MENU_ITEM } from './panel-helpers';

/**
 * The viewer in a browser with nothing behind it: every backend call these
 * tests make is answered here, because the Vite dev server proxies the platform
 * prefixes to whatever stack is on 5174 and an unanswered route reaches it.
 *
 * Run: npm run test:e2e:react
 */

/** Platform prefixes the dev server proxies (BACKEND_PREFIXES in vite.config.js). */
const BACKEND_PATH = /^\/(api\/v1|tiles|agora|agent)\//;
const isBackendCall = (url) => BACKEND_PATH.test(url.pathname);

/** The four services, in the order the header lists them (src/offline/backends.ts). */
const BACKEND_LABELS = ['ptolemy (data)', 'tiletopia (tiles)', 'agora (live)', 'geolang (agent)'];

// chrome logs a refused request as a console error
const BACKEND_REQUEST_REFUSED = /Failed to load resource.*\/(api\/v1|tiles|agora|agent)\//;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
  });
});

// every Select builds its dropdown out of the same Popover, so the header's is
// the one that is not one
const SYNC_POPOVER =
  '[class*="mantine-Popover-dropdown"]:not([class*="mantine-Select-dropdown"])';

/** Every platform call refused, the state a viewer with no stack behind it is in. */
async function refuseEveryBackend(page) {
  allowConsoleError(page, BACKEND_REQUEST_REFUSED);
  await page.route(isBackendCall, (route) => route.abort());
}

// the header paints about 8 s after the navigation here, past the default
// assertion timeout
const SHELL_TIMEOUT = 30000;

/** Load the viewer and wait for its header, which every test starts from. */
async function bootViewer(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Layers' })).toBeVisible({
    timeout: SHELL_TIMEOUT,
  });
}

test('the header names all four services when none of them answer', async ({ page }) => {
  await refuseEveryBackend(page);
  await bootViewer(page);

  await expect(page.getByText(`${BACKEND_LABELS.length} services down`)).toBeVisible();

  await page.getByRole('button', { name: 'Sync status' }).click();
  await expect(page.getByTestId('backend-status').getByTestId('backend-down')).toHaveText(
    BACKEND_LABELS.map((label) => `${label} is unreachable`),
  );
});

const TILE_HOST = 'https://tiles.test';
const XYZ_TEMPLATE = `${TILE_HOST}/{z}/{x}/{y}.png`;
const TILE_UNAVAILABLE_STATUS = 503;
const TILE_REQUEST_REFUSED = /Failed to load resource.*tiles\.test/;

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// a cached 503 would survive the retry and read as the retry not working
const NO_STORE = { 'cache-control': 'no-store' };

const MAP_STYLE_TIMEOUT = 60000;

async function waitForMapLibre(page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__viewtopiaMap?.isStyleLoaded())), {
      timeout: MAP_STYLE_TIMEOUT,
    })
    .toBe(true);
}

test('a layer whose tiles fail says so on its row and redraws on retry', async ({ page }) => {
  await refuseEveryBackend(page);
  allowConsoleError(page, TILE_REQUEST_REFUSED);

  let tilesAvailable = false;
  let tilesServed = 0;
  await page.route(`${TILE_HOST}/**`, (route) => {
    if (!tilesAvailable) {
      return route.fulfill({
        status: TILE_UNAVAILABLE_STATUS,
        contentType: 'text/plain',
        body: 'tile server down',
        headers: NO_STORE,
      });
    }
    tilesServed += 1;
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: ONE_PIXEL_PNG,
      headers: NO_STORE,
    });
  });

  await bootViewer(page);
  await waitForMapLibre(page);

  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Data Sources' }).first().click();
  const panel = page.getByTestId('data-sources-panel');
  await panel.getByPlaceholder('Layer name').fill('failing tiles');
  await panel.getByPlaceholder('Service URL').fill(XYZ_TEMPLATE);
  await panel.locator('input[aria-label="Type"]').click();
  await page.getByRole('option', { name: 'XYZ Tiles' }).click();
  await panel.getByRole('button', { name: 'Add' }).click();

  const badge = panel.getByTestId('layer-load-error');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', new RegExp(`${TILE_UNAVAILABLE_STATUS}`));

  tilesAvailable = true;
  await panel.getByTestId('layer-retry').click();
  // the map is never touched, so only the retry can have asked for tiles again
  await expect.poll(() => tilesServed).toBeGreaterThan(0);
  await expect(badge).toHaveCount(0);
  await expect(panel.getByText(XYZ_TEMPLATE)).toBeVisible();
});

const DATASET = { id: 'dataset-1', name: 'refused-commit' };
const BRANCH = { id: 'branch-1', name: 'main' };
const FEATURE_ID = 'feature-1';
const FEATURE_NAME = 'site A';
const EDITED_NAME = 'site A renamed';
const REFUSAL_TEXT = 'no write access to branch';
const REFUSED_STATUS = 403;
const BROWSER_USER = 'backend-absent-e2e';
const SESSION_SECONDS = 3600;

/**
 * A session token for the auth store to restore. Nothing client side verifies a
 * signature, and the calls it would authorize are answered by this spec.
 */
function sessionToken(subject) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    sub: subject,
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.unsigned`;
}

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('a commit the server refuses is shown once and dropped', async ({ page }) => {
  allowConsoleError(page, BACKEND_REQUEST_REFUSED);

  let commitAttempts = 0;
  await page.route(isBackendCall, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v1/datasets') return json(route, [DATASET]);
    if (pathname === `/api/v1/datasets/${DATASET.id}/branches`) return json(route, [BRANCH]);
    if (pathname === `/api/v1/branches/${BRANCH.id}/features`) {
      return json(route, {
        features: [{ id: FEATURE_ID, geometry_wkb: [], properties: { name: FEATURE_NAME } }],
      });
    }
    if (pathname === `/api/v1/branches/${BRANCH.id}/features/${FEATURE_ID}`) {
      return json(route, {
        feature_id: FEATURE_ID,
        geometry_wkb_hex: '',
        properties: { name: FEATURE_NAME },
      });
    }
    if (pathname === `/api/v1/branches/${BRANCH.id}/commit`) {
      commitAttempts += 1;
      return route.fulfill({
        status: REFUSED_STATUS,
        contentType: 'text/plain',
        body: REFUSAL_TEXT,
      });
    }
    return route.abort();
  });

  await page.addInitScript(
    (seed) => localStorage.setItem('viewtopia_auth', JSON.stringify(seed)),
    { user: { name: BROWSER_USER }, token: sessionToken(BROWSER_USER) },
  );
  await bootViewer(page);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: 'Dataset Editor' }).first().click();
  await page.getByPlaceholder('Pick a dataset').click();
  await page.getByRole('option', { name: DATASET.name }).click();

  await expect(page.getByTestId('dataset-editor-feature')).toHaveCount(1);
  await page.getByTestId('dataset-editor-feature').click();
  await page.getByTestId('property-value-name').fill(EDITED_NAME);

  // nothing presses Commit: the queued edit syncs itself a second later
  const notification = page.locator('[class*="mantine-Notification-root"]');
  await expect(notification).toContainText('Edit refused');
  await expect(notification).toContainText(REFUSAL_TEXT);
  // an empty queue is the edit having been dropped rather than held for a retry
  await expect(page.getByTestId('dataset-editor-commit')).toBeDisabled();
  expect(commitAttempts).toBe(1);

  await page.getByRole('button', { name: 'Sync status' }).click();
  await expect(page.locator(SYNC_POPOVER)).toContainText(REFUSAL_TEXT);
});

const AGENT_RUN_FAILED = /Agent execution failed/;
const AGENT_UNREACHABLE = 'geolang (agent) is unreachable';

test('a chat send with the agent down names the agent', async ({ page }) => {
  await refuseEveryBackend(page);
  // the AG-UI client logs the run it could not make before rethrowing it
  allowConsoleError(page, AGENT_RUN_FAILED);

  await bootViewer(page);
  await page.getByRole('button', { name: 'Show chat' }).click();
  const input = page.getByPlaceholder('Type a message…');
  await input.fill('where am I');
  await input.press('Enter');

  // exact, so a run that did get a status cannot pass as one that got nothing
  await expect(page.getByText(`⚠ ${AGENT_UNREACHABLE}`, { exact: true })).toBeVisible();
});
