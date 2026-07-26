import { test, expect } from './console-guard';
import { platformAuthHeaders } from '../../scripts/platform-token.mjs';

/**
 * Golden-path E2E against the live platform stack (docker-compose.platform.yml).
 *
 * This is the "is it shippable?" gate: it proves the deployed SPA can reach every
 * backend through the same-origin nginx proxy — the exact paths the app uses
 * (`/api/...`, `/tiles/...`, `/api/geocode/...`, `/api/route`). It does NOT use the
 * dev server, and is excluded from the default `npm run test:e2e` run.
 *
 * Run: docker compose -f docker-compose.platform.yml up -d && npm run test:e2e:platform
 *
 * The agent NL->map step is intentionally omitted (it spends real LLM credits);
 * see DESIGN_TODO.md Track 1.
 */

// Asset upload and delete are writes, so they need a token when the stack
// enforces auth; every other call here is a public read.
const AUTH = platformAuthHeaders({ role: 'editor', sub: 'golden-path-e2e' });

// Run all backend fetches from the SPA's browser origin, so we exercise the same
// same-origin proxy + CORS behaviour the real app does.
async function fetchFromApp(page, path, init) {
  return page.evaluate(
    async ({ p, i }) => {
      const res = await fetch(p, i);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: res.status, ok: res.ok, text, json };
    },
    { p: path, i: init },
  );
}

test.describe('Golden path — live platform stack', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('viewtopia-tour-done', '1'));
  });

  test('viewer SPA loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('ViewTopia');
  });

  test('ptolemy is reachable via /api/ proxy', async ({ page }) => {
    await page.goto('/');
    const r = await fetchFromApp(page, '/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.text.trim().toLowerCase()).toContain('ok');
  });

  test('tiletopia is reachable via /tiles/ proxy', async ({ page }) => {
    await page.goto('/');
    const r = await fetchFromApp(page, '/tiles/v1/health');
    expect(r.status).toBe(200);
    expect(r.json?.status).toBe('ok');
  });

  test('tiletopia ingests a point cloud and serves its tileset', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    // upload a small ascii ply through the proxy; point-cloud uploads auto-tile
    const asset = await page.evaluate(async (auth) => {
      const n = 200;
      const lines = [
        'ply',
        'format ascii 1.0',
        `element vertex ${n}`,
        'property float x',
        'property float y',
        'property float z',
        'end_header',
      ];
      for (let i = 0; i < n; i++) {
        const lon = 7.42 + (i % 20) * 0.0001;
        const lat = 43.73 + Math.floor(i / 20) * 0.0001;
        lines.push(`${lon} ${lat} ${10 + (i % 5)}`);
      }
      const form = new FormData();
      form.append('name', `golden-path-${Date.now()}.ply`);
      form.append('file', new Blob([lines.join('\n')], { type: 'application/octet-stream' }), 'cloud.ply');
      const res = await fetch('/tiles/v1/assets', { method: 'POST', headers: auth, body: form });
      return { status: res.status, json: await res.json() };
    }, AUTH);
    expect(asset.status).toBe(201);
    const assetId = asset.json.id;

    // the job worker polls every 2s; wait for the asset to go ready.
    // tiletopia only exempts tile-data GETs from auth, so asset metadata reads
    // carry the token too.
    await expect
      .poll(
        async () =>
          (await fetchFromApp(page, `/tiles/v1/assets/${assetId}`, { headers: AUTH })).json
            ?.status,
        { timeout: 90_000, intervals: [2000] },
      )
      .toBe('ready');

    const tileset = await fetchFromApp(page, `/tiles/v1/assets/${assetId}/tileset.json`, {
      headers: AUTH,
    });
    expect(tileset.status).toBe(200);
    expect(tileset.json?.root).toBeTruthy();
    expect(tileset.json?.asset?.version).toBeTruthy();

    // cleanup so reruns don't accumulate assets
    const del = await fetchFromApp(page, `/tiles/v1/assets/${assetId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect([200, 204]).toContain(del.status);
  });

  test('geocoding returns a hit via /api/geocode/ proxy', async ({ page }) => {
    await page.goto('/');
    // geokode serves the Monaco OSM extract (see docker-compose.platform.yml)
    const r = await fetchFromApp(page, '/api/geocode/forward?q=Boulevard%20Albert');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json?.results)).toBe(true);
    expect(r.json.results.length).toBeGreaterThanOrEqual(1);
    expect(r.json.results[0]).toHaveProperty('lat');
    expect(r.json.results[0]).toHaveProperty('lon');
  });

  test('geocoding matches by street name (not just house number)', async ({ page }) => {
    await page.goto('/');
    // geokode indexes street/city variants — querying a street name (the
    // common case) must return hits. "Rue Grimaldi" exists in the Monaco extract.
    const r = await fetchFromApp(page, '/api/geocode/forward?q=Rue%20Grimaldi');
    expect(r.status).toBe(200);
    expect(r.json?.results?.length).toBeGreaterThanOrEqual(1);
  });

  test('routing returns a route via /api/route proxy', async ({ page }) => {
    await page.goto('/');
    // Two points within the Monaco graph built during Track 1.
    const r = await fetchFromApp(
      page,
      '/api/route?from=43.7384,7.4246&to=43.7320,7.4197',
    );
    expect(r.status).toBe(200);
    expect(r.json?.distance_m).toBeGreaterThan(0);
    expect(r.json?.duration_s).toBeGreaterThan(0);
    expect(Array.isArray(r.json?.geometry)).toBe(true);
    expect(r.json.geometry.length).toBeGreaterThan(1);
  });

  test('python cell round-trips via /jupyter/ proxy (REST + kernel WS)', async ({ page }) => {
    await page.goto('/');
    // The platform stack ships the jupyter service, so this is a hard requirement.
    const probe = await fetchFromApp(page, '/jupyter/api');
    expect(probe.status, '/jupyter/ proxy unreachable — is the jupyter service up?').toBe(200);

    // Same browser-origin path the notebook uses (src/notebooks/jupyter.ts):
    // start a kernel over REST, execute `1+1` over the kernel WebSocket.
    const result = await page.evaluate(async (token) => {
      const auth = { Authorization: `token ${token}` };
      const start = await fetch('/jupyter/api/kernels', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'python3' }),
      });
      const { id } = await start.json();
      const wsBase = location.origin.replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsBase}/jupyter/api/kernels/${id}/channels?token=${encodeURIComponent(token)}`);
      const msgId = crypto.randomUUID().replace(/-/g, '');
      const value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 20000);
        ws.onopen = () => ws.send(JSON.stringify({
          header: { msg_id: msgId, msg_type: 'execute_request', username: 't', session: msgId, date: new Date().toISOString(), version: '5.3' },
          parent_header: {}, metadata: {},
          content: { code: '1+1', silent: false, store_history: true, user_expressions: {}, allow_stdin: false, stop_on_error: true },
          channel: 'shell',
        }));
        ws.onerror = () => reject(new Error('ws error'));
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.parent_header?.msg_id === msgId && msg.header.msg_type === 'execute_result') {
            clearTimeout(timer);
            resolve(msg.content.data['text/plain']);
          }
        };
      });
      ws.close();
      await fetch(`/jupyter/api/kernels/${id}`, { method: 'DELETE', headers: auth });
      return value;
    }, 'viewtopia-local');

    expect(String(result).trim()).toBe('2');
  });
});
