import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';

/**
 * P0 item 9's last two steps against the live platform stack: run a real agent
 * tool, then draw its real output on the map.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/agent-tool-run.spec.js
 *
 * Nothing here is mocked: the tool runs in geolang-executor, and the layer comes
 * back through the viewer's own `/agent/geojson/<file>` fetch. The NL step is
 * still absent on purpose — no LLM is involved, so this costs nothing to run.
 *
 * `voronoi` is the tool because it needs no external network: its input is the
 * GeoJSON uploaded a step earlier, and the tessellation is pure geometry. Every
 * other vector tool either downloads its input or reads a dataset the image does
 * not ship.
 *
 * Output files are scoped to the token's `sub`, so the tool call and the
 * browser's layer fetch must be the same user or the fetch 404s.
 */

const BROWSER_USER = 'agent-tool-e2e';

const DEPOTS = {
  type: 'FeatureCollection',
  features: [
    { name: 'Depot North', coordinates: [7.42, 43.745] },
    { name: 'Depot East', coordinates: [7.431, 43.739] },
    { name: 'Depot South', coordinates: [7.424, 43.73] },
    { name: 'Depot West', coordinates: [7.412, 43.736] },
  ].map(({ name, coordinates }) => ({
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates },
  })),
};

const DEPOT_NAMES = DEPOTS.features.map((f) => f.properties.name).sort();

/** The GPKG a tool result says it wrote, e.g. "Saved to outputs/x.gpkg." */
function savedOutput(result) {
  return /Saved to (outputs\/\S+?\.gpkg)/.exec(result)?.[1];
}

/** What MapLibre is actually drawing for the replayed agent layer. */
const drawnAgentLayer = (page) =>
  page.evaluate(() => {
    const map = window.__viewtopiaMap;
    if (!map) return null;
    const style = map.getStyle();
    const sourceId = Object.keys(style?.sources ?? {}).find((id) =>
      id.startsWith('agent-layer-'),
    );
    if (!sourceId) return null;
    const data = style.sources[sourceId].data;
    if (!data?.features) return null;
    return {
      sourceId,
      layerIds: (style.layers ?? []).map((l) => l.id).filter((id) => id.startsWith(sourceId)),
      geometryTypes: [...new Set(data.features.map((f) => f.geometry?.type))],
      names: data.features.map((f) => f.properties?.name).sort(),
    };
  });

test('a real tool run draws its own output on the map', async ({ page }) => {
  test.setTimeout(180_000);

  const token = mintToken({ role: 'editor', sub: BROWSER_USER });
  expect(token, 'PLATFORM_JWT_SECRET is not set, so the agent routes refuse every call').toBeTruthy();

  await page.addInitScript(
    (seed) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(seed));
    },
    { user: { name: BROWSER_USER }, token },
  );
  await page.goto('/');

  const stamp = Date.now();
  const uploadName = `depots-${stamp}.geojson`;

  // the tool reads a file, so give it one: the points go to this user's
  // user_data through the same /agent/ proxy the viewer uses
  const upload = await page.evaluate(
    async ({ bearer, name, geojson }) => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' }),
        name,
      );
      const res = await fetch('/agent/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        body: form,
      });
      return { status: res.status, json: await res.json() };
    },
    { bearer: token, name: uploadName, geojson: DEPOTS },
  );
  expect(upload.status, JSON.stringify(upload.json)).toBe(200);
  expect(upload.json.row_count).toBe(DEPOTS.features.length);
  expect(upload.json.geometry_type).toBe('Point');

  const run = await page.evaluate(
    async ({ bearer, args }) => {
      const res = await fetch('/agent/tools/voronoi', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
      });
      return { status: res.status, json: await res.json() };
    },
    {
      bearer: token,
      args: {
        input_path: uploadName,
        label_col: 'name',
        output_filename: `depot-zones-${stamp}`,
      },
    },
  );
  expect(run.status).toBe(200);
  // the route answers 200 even for a failure, with the reason in the string
  expect(run.json.result, 'the tool run failed').not.toContain('❌');
  expect(run.json.result).toContain(`${DEPOTS.features.length} cells`);

  const outputPath = savedOutput(run.json.result);
  expect(outputPath, `no output file named in: ${run.json.result}`).toBeTruthy();

  // Replaying a stored result is the same renderUISpec path a live agent reply
  // takes, and it is the one that needs no LLM. The layer file is the one the
  // tool just named, and nothing stubs the fetch for it.
  await page.addInitScript((session) => {
    localStorage.setItem(
      'viewtopia-chat',
      JSON.stringify({
        state: { sessions: [session], activeSessionId: session.id },
        version: 0,
      }),
    );
  }, {
    id: `agent-tool-run-${stamp}`,
    name: 'Session 1',
    messages: [
      { id: 'u1', role: 'user', content: 'draw catchment zones for the depots', timestamp: 1 },
      {
        id: 'a1',
        role: 'assistant',
        content: run.json.result,
        timestamp: 2,
        mapSpec: {
          type: 'map',
          layers: [{ name: 'Depot zones', file: outputPath, color: '#10b981' }],
        },
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__viewtopiaMap, null, { timeout: 60_000 });

  await page.getByRole('button', { name: 'Show chat' }).click();
  await page.getByTitle('Click to replay this result on the map').click();

  await expect.poll(() => drawnAgentLayer(page), { timeout: 60_000 }).not.toBeNull();
  const drawn = await drawnAgentLayer(page);

  // the cells are the tool's, not a fixture's: one polygon per uploaded depot,
  // carrying the label column the tool was told to use
  expect(drawn.geometryTypes).toEqual(['Polygon']);
  expect(drawn.names).toEqual(DEPOT_NAMES);
  expect(drawn.layerIds).toContain(`${drawn.sourceId}-fill`);

  await expect(page.locator('#maplibre-container canvas').first()).toBeVisible();
});
