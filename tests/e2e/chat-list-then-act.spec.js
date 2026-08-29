import { test, expect, allowConsoleError } from './console-guard';

/**
 * List, then act on one entry by the name the list gave. The three pairs go to
 * agora (live documents) and ptolemy (projects, datasets, branches), all of
 * them answered here, because this config starts no platform stack.
 *
 *   npx playwright test -c playwright.react.config.js tests/e2e/chat-list-then-act.spec.js
 */

const BOOT_TIMEOUT = 60_000;
const SETTLE_TIMEOUT = 30_000;

/** An opaque token rather than a JWT, so nothing here reads an expiry. */
const AUTH = { user: { name: 'chat-list-then-act-e2e' }, token: 'e2e-api-key' };

// two documents named Coastline, so the list has to tell them apart by id
const DOCUMENTS = [
  { id: 'doc-1', name: 'Coastline' },
  { id: 'doc-2', name: 'Coastline north' },
  { id: 'doc-3', name: 'Campus twin' },
  { id: 'doc-4', name: 'Coastline' },
];

function project(id, name) {
  return {
    id,
    workspace_id: 'w-1',
    name,
    description: null,
    created_by: 'ada',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    role: 'owner',
  };
}

const PROJECTS = [
  project('p-1', 'Harbour survey'),
  project('p-2', 'Harbour north'),
  project('p-3', 'Campus twin'),
  project('p-4', 'Harbour survey'),
];

function dataset(id, name) {
  return { id, name, project_id: null, visibility: 'private' };
}

const DATASETS = [dataset('d-1', 'twin-assets'), dataset('d-2', 'twin-roads'), dataset('d-3', 'twin-assets')];

const BRANCHES = {
  'd-1': [
    { id: 'b-assets-main', name: 'main' },
    { id: 'b-sensors', name: 'more sensors' },
  ],
  'd-2': [{ id: 'b-roads-main', name: 'main' }],
  'd-3': [{ id: 'b-other-main', name: 'main' }],
};

/** point (1 2) as ptolemy hands geometry back on /features */
const POINT_WKB_HEX = '0101000000000000000000f03f0000000000000040';
const POINT_WKB_BYTES = POINT_WKB_HEX.match(/../g).map((pair) => Number.parseInt(pair, 16));

const BRANCH_FEATURE_COUNT = 2;

const ROADS_BRANCH_LAYER = 'agent-layer-ptolemy-branch-b-roads-main';

/** An AG-UI run that starts and finishes with nothing in between. */
const EMPTY_RUN = [
  'data: {"type":"RUN_STARTED","threadId":"e2e-session","runId":"e2e-run"}',
  '',
  'data: {"type":"RUN_FINISHED","threadId":"e2e-session","runId":"e2e-run"}',
  '',
  '',
].join('\n');

const AGORA_SOCKET_REFUSED = /WebSocket connection to .*\/agora\/ws/;

const runAction = (page, name, args) =>
  page.evaluate(([name, args]) => window.__viewtopiaRunAction({ name, args }), [name, args]);

const snapshot = (page) => page.evaluate(() => window.__viewtopiaSnapshot());

const maplibreLayerIds = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaMap;
    if (!map) return [];
    return (map.getStyle()?.layers ?? [])
      .map((layer) => layer.id)
      .filter((id) => id.startsWith('agent-layer-'));
  });

const json = (route, body) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

/** A path this suite does not model, said out loud rather than proxied away. */
const unmodelled = (route, pathname) =>
  route.fulfill({ status: 404, contentType: 'text/plain', body: `no fixture for ${pathname}` });

async function routePtolemy(page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/'),
    (route, request) => {
      const { pathname, searchParams } = new URL(request.url());
      const path = pathname.replace('/api/v1', '');
      if (path === '/workspaces') return json(route, []);
      if (path === '/projects') return json(route, PROJECTS);
      if (/^\/projects\/[^/]+\/state\//.test(path)) {
        if (request.method() === 'PUT') return route.fulfill({ status: 204 });
        // nobody has written this project a map, which is not a failure
        return json(route, { value: null, updated_at: '2026-08-01T00:00:00Z', updated_by: 'ada' });
      }
      if (path === '/datasets') return json(route, DATASETS);
      const branches = /^\/datasets\/([^/]+)\/branches$/.exec(path);
      if (branches) return json(route, BRANCHES[branches[1]] ?? []);
      const features = /^\/branches\/([^/]+)\/features$/.exec(path);
      if (features && searchParams.has('limit')) {
        return json(route, {
          features: Array.from({ length: BRANCH_FEATURE_COUNT }, (_, index) => ({
            id: `${features[1]}-${index}`,
            geometry_wkb: POINT_WKB_BYTES,
            properties: { name: `${features[1]}-${index}` },
          })),
        });
      }
      return unmodelled(route, pathname);
    },
  );
}

async function routeAgora(page) {
  await page.route(
    (url) => url.pathname.startsWith('/agora/'),
    (route, request) => {
      const { pathname } = new URL(request.url());
      if (pathname === '/agora/documents') return json(route, DOCUMENTS);
      if (pathname === '/agora/notifications') return json(route, []);
      if (pathname === '/agora/health') return json(route, { status: 'stubbed' });
      return unmodelled(route, pathname);
    },
  );
}

async function routeAgent(page) {
  await page.route(
    (url) => url.pathname.startsWith('/agent/'),
    (route, request) => {
      const { pathname } = new URL(request.url());
      if (pathname === '/agent/health') return json(route, { status: 'stubbed' });
      if (pathname === '/agent/models') return json(route, { active: null, profiles: [] });
      if (pathname === '/agent/sessions/new') return json(route, { id: 'e2e-session', name: 'Session 1' });
      if (pathname.startsWith('/agent/sessions')) return route.fulfill({ status: 204 });
      // a read action queues a follow-up run, and this is a run that says nothing
      if (pathname === '/agent/chat/agui') {
        return route.fulfill({ contentType: 'text/event-stream', body: EMPTY_RUN });
      }
      return unmodelled(route, pathname);
    },
  );
}

test.beforeEach(async ({ page }) => {
  await routePtolemy(page);
  await routeAgora(page);
  await routeAgent(page);
  await page.addInitScript((auth) => {
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia-tour-done', '1');
    localStorage.setItem('viewtopia_auth', JSON.stringify(auth));
  }, AUTH);
});

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaRunAction, null, { timeout: BOOT_TIMEOUT });
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: BOOT_TIMEOUT });
  await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
}

test('live.list names the documents, then live.join opens a socket for the one named', async ({
  page,
}) => {
  allowConsoleError(page, AGORA_SOCKET_REFUSED);
  const socketUrls = [];
  page.on('websocket', (socket) => socketUrls.push(socket.url()));

  await boot(page);

  await runAction(page, 'live.list', {});
  await expect(
    page.getByText(
      '4 live documents: Coastline (doc-1), Coastline north, Campus twin, Coastline (doc-4).',
    ),
  ).toBeVisible({ timeout: SETTLE_TIMEOUT });

  await runAction(page, 'live.join', { document: 'Campus twin' });

  await expect(page.getByText('Joined Campus twin.')).toBeVisible({ timeout: SETTLE_TIMEOUT });
  // agora is not here, so the attempt is all there is: no handshake completes
  await expect
    .poll(() => socketUrls.find((url) => url.includes('/agora/ws')) ?? '', {
      timeout: SETTLE_TIMEOUT,
    })
    .toContain('doc=doc-3');
});

test('project.list names the projects, then project.open opens the one named', async ({ page }) => {
  await boot(page);
  expect((await snapshot(page)).project).not.toEqual({ id: 'p-3', name: 'Campus twin' });

  await runAction(page, 'project.list', {});
  await expect(
    page.getByText(
      '4 projects: Harbour survey (p-1), Harbour north, Campus twin, Harbour survey (p-4).',
    ),
  ).toBeVisible({ timeout: SETTLE_TIMEOUT });

  await runAction(page, 'project.open', { project: 'Campus twin' });

  await expect(page.getByText('Opened Campus twin.')).toBeVisible({ timeout: SETTLE_TIMEOUT });
  await expect
    .poll(async () => (await snapshot(page)).project, { timeout: SETTLE_TIMEOUT })
    .toEqual({ id: 'p-3', name: 'Campus twin' });
});

test('dataset.list names the datasets, then draw_branch draws the one named', async ({ page }) => {
  await boot(page);

  await runAction(page, 'dataset.list', {});
  await expect(
    page.getByText(
      '3 datasets. twin-assets (d-1): main, more sensors. twin-roads: main. twin-assets (d-3): main.',
    ),
  ).toBeVisible({ timeout: SETTLE_TIMEOUT });

  await runAction(page, 'dataset.draw_branch', { dataset: 'twin-roads' });

  await expect(
    page.getByText(`Drew ${BRANCH_FEATURE_COUNT} features from main of twin-roads.`),
  ).toBeVisible({ timeout: SETTLE_TIMEOUT });
  await expect
    .poll(() => maplibreLayerIds(page), { timeout: SETTLE_TIMEOUT })
    .toEqual(expect.arrayContaining([expect.stringContaining(ROADS_BRANCH_LAYER)]));
});
