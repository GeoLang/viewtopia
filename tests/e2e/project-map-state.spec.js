import { test, expect, allowConsoleError } from './console-guard';
import { serveBasemapsLocally } from './local-basemap';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * The map belongs to the project, not to the browser: one session moves the
 * camera and a second session, on a browser that has never seen the project,
 * opens it and lands on the same view.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/project-map-state.spec.js
 *
 * Ptolemy is reached directly (localhost:3000) to create the workspace and the
 * project and to read the stored snapshot back. Everything the app does goes
 * through the SPA's same-origin /api proxy.
 */

const PTOLEMY = 'http://localhost:3000';
const BROWSER_USER = 'map-state-e2e';

// Venice, far enough from the default view that no default could pass for it
const VENICE = { lng: 12.3355, lat: 45.4408, zoom: 12 };
const DEGREES_TOLERANCE = 0.05;

async function ptolemy(path, token, init) {
  const res = await fetch(`${PTOLEMY}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  // an error body is plain text, so a refusal is readable in the assertion
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

/**
 * Open the SPA already signed in and already on `projectId`, and wait until it
 * has read that project's map. Nothing before that read is saved: the app only
 * starts watching the map once it knows which project is open.
 */
async function openProject(page, token, projectId) {
  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed.auth));
      localStorage.setItem('viewtopia-active-project', seed.projectId);
    },
    { auth: { user: { name: BROWSER_USER }, token }, projectId },
  );
  const mapRead = page.waitForResponse(
    (response) => response.url().includes(`/projects/${projectId}/state/map`),
    { timeout: 60_000 },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });
  await mapRead;
}

function mapCentre(page) {
  return page.evaluate(() => {
    const map = window.__viewtopiaMap;
    const centre = map.getCenter();
    return { lng: centre.lng, lat: centre.lat, zoom: map.getZoom() };
  });
}

test.describe('a project map is the same map for every member', () => {
  test('a camera move in one session is what the next session opens on', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);

    const token = mintToken({ role: 'editor', sub: BROWSER_USER });
    expect(
      token,
      'PLATFORM_JWT_SECRET is not set, so no authenticated project is possible',
    ).toBeTruthy();

    const workspace = await ptolemy('/workspaces', token, {
      method: 'POST',
      body: JSON.stringify({ name: `map-state-e2e-${Date.now()}` }),
    });
    expect(workspace.status, workspace.text).toBe(201);

    const project = await ptolemy(`/workspaces/${workspace.json.id}/projects`, token, {
      method: 'POST',
      body: JSON.stringify({ name: `venice-${Date.now()}` }),
    });
    expect(project.status, project.text).toBe(201);
    const projectId = project.json.id;

    // nobody has saved a map yet
    const unset = await ptolemy(`/projects/${projectId}/state/map`, token);
    expect(unset.status).toBe(404);

    // ─── Session one moves the camera ────────────────────────────────
    // a project nobody has saved a map for answers 404, which chromium logs as
    // a failed resource. That is the documented answer for an unset key.
    allowConsoleError(page, /Failed to load resource.*\/state\/map/);
    await openProject(page, token, projectId);
    await page.evaluate((view) => {
      window.__viewtopiaMap.jumpTo({ center: [view.lng, view.lat], zoom: view.zoom });
    }, VENICE);

    // the save is debounced, so the snapshot arrives a few seconds later
    await expect
      .poll(
        async () => (await ptolemy(`/projects/${projectId}/state/map`, token)).json?.value?.camera,
        { timeout: 30_000, intervals: [1000] },
      )
      .toEqual(
        expect.objectContaining({
          lng: expect.closeTo(VENICE.lng, 2),
          lat: expect.closeTo(VENICE.lat, 2),
        }),
      );

    const stored = await ptolemy(`/projects/${projectId}/state/map`, token);
    expect(stored.json.updated_by).toBe(BROWSER_USER);

    // ─── Session two opens the same project ──────────────────────────
    const second = await browser.newContext();
    try {
      const other = await second.newPage();
      await serveBasemapsLocally(other);
      await openProject(other, token, projectId);

      await expect
        .poll(async () => (await mapCentre(other)).lng, { timeout: 30_000, intervals: [500] })
        .toBeCloseTo(VENICE.lng, 1);

      const centre = await mapCentre(other);
      expect(Math.abs(centre.lat - VENICE.lat)).toBeLessThan(DEGREES_TOLERANCE);
      expect(centre.zoom).toBeCloseTo(VENICE.zoom, 0);
    } finally {
      await second.close();
    }
  });
});
