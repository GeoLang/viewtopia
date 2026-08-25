import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';
import { seedTwin } from '../../scripts/seed-twin.mjs';
import { startProducer } from './fixtures/twin-producer.mjs';

/**
 * The digital twin slice against the live platform stack: a node producer sends
 * readings into agora, agora fans them out over the map document, and the
 * browser recolours the asset layer and shows the values in the inspector.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/digital-twin.spec.js
 */

const PTOLEMY = 'http://localhost:3000';
const AGORA = 'http://localhost:5174/agora';

const BROWSER_USER = 'twin-e2e-browser';

/** The asset every assertion below follows. */
const WATCHED_ASSET = 'TWIN-03';

const COOL_TEMPERATURE = 21;
const HOT_TEMPERATURE = 31;

// the seeded rule's colours
const COOL_COLOR = '#2ecc71';
const HOT_COLOR = '#e74c3c';
const OFFLINE_COLOR = '#7f8c8d';

const CIRCLE_LAYER = 'agent-layer-twin-assets-circle';

const PRODUCER_INTERVAL_MS = 1000;

/** Agora marks an asset offline after three missed 2s intervals. */
const OFFLINE_TIMEOUT_MS = 10_000;

async function addEditMember(documentId, token, userId) {
  const response = await fetch(
    `${AGORA}/documents/${documentId}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: 'edit' }),
    },
  );
  expect(response.status, await response.text()).toBeLessThan(300);
}

/** The colour the layer's match expression gives one asset, or null. */
function assetColor(page, asset) {
  return page.evaluate(
    ([layerId, assetId]) => {
      const map = window.__viewtopiaMap;
      if (!map?.getLayer(layerId)) return null;
      const paint = map.getPaintProperty(layerId, 'circle-color');
      if (!Array.isArray(paint) || paint[0] !== 'match') return null;
      for (let index = 2; index < paint.length - 1; index += 2) {
        if (paint[index] === assetId) return paint[index + 1];
      }
      return null;
    },
    [CIRCLE_LAYER, asset],
  );
}

function expectAssetColor(page, asset, color, timeout) {
  return expect
    .poll(() => assetColor(page, asset), { timeout, intervals: [200] })
    .toBe(color);
}

test.describe('digital twin — live platform stack', () => {
  let producer = null;

  test.afterEach(() => {
    producer?.stop();
    producer = null;
  });

  test('readings recolour the asset layer and fill the inspector', async ({ page }) => {
    test.setTimeout(240_000);

    const token = mintToken({ role: 'editor', sub: BROWSER_USER });
    expect(token, 'PLATFORM_JWT_SECRET is not set, so no live document is possible').toBeTruthy();

    const seed = await seedTwin({ ptolemyUrl: PTOLEMY, agoraUrl: AGORA });
    const seedToken = mintToken({ role: 'editor', sub: 'twin-seed' });
    await addEditMember(seed.documentId, seedToken, BROWSER_USER);

    await page.addInitScript((session) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia_auth', JSON.stringify(session));
    }, { user: { name: BROWSER_USER }, token });
    await page.goto(`/?doc=${seed.documentId}`);

    // the layer reaches the map only through agora's snapshot, so waiting for it
    // covers the join, the document read and the agent layer materialization
    await page.waitForFunction(
      (layerId) => !!window.__viewtopiaMap?.getLayer(layerId),
      CIRCLE_LAYER,
      { timeout: 60_000 },
    );

    // one value per asset, so a single reading can be pushed above the threshold
    // without the next tick putting it back
    const temperatures = new Map();
    producer = await startProducer({
      agoraUrl: AGORA,
      feedToken: seed.feedToken,
      assetIds: seed.assetIds,
      intervalMs: PRODUCER_INTERVAL_MS,
      valueFor: (asset) => temperatures.get(asset) ?? COOL_TEMPERATURE,
    });

    await expectAssetColor(page, WATCHED_ASSET, COOL_COLOR, 30_000);
    expect(producer.errors).toEqual([]);

    const beforeHotReading = new Date().toISOString();

    temperatures.set(WATCHED_ASSET, HOT_TEMPERATURE);
    producer.send([
      { asset: WATCHED_ASSET, kind: 'temperature', value: HOT_TEMPERATURE, at: new Date().toISOString() },
    ]);
    await expectAssetColor(page, WATCHED_ASSET, HOT_COLOR, 30_000);

    // Inspect is the picking mode, so the button arms it on its own
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByLabel('Click a feature to inspect')).toBeChecked();

    const clickPoint = await page.evaluate(
      ([sourceId, assetId]) => {
        const map = window.__viewtopiaMap;
        const feature = map
          .querySourceFeatures(sourceId)
          .find((candidate) => candidate.properties.asset_id === assetId);
        if (!feature) return null;
        const point = map.project(feature.geometry.coordinates);
        return { x: point.x, y: point.y };
      },
      ['agent-layer-twin-assets', WATCHED_ASSET],
    );
    expect(clickPoint, `${WATCHED_ASSET} is not drawn on screen`).toBeTruthy();
    await page.mouse.click(clickPoint.x, clickPoint.y);

    await expect(page.getByTestId('asset-reading-temperature')).toContainText(
      String(HOT_TEMPERATURE),
    );
    await expect(page.getByTestId('asset-online')).toHaveText('online');

    producer.stop();
    producer = null;
    await expectAssetColor(page, WATCHED_ASSET, OFFLINE_COLOR, OFFLINE_TIMEOUT_MS);
    await expect(page.getByTestId('asset-online')).toHaveText('offline');

    producer = await startProducer({
      agoraUrl: AGORA,
      feedToken: seed.feedToken,
      assetIds: seed.assetIds,
      intervalMs: PRODUCER_INTERVAL_MS,
      valueFor: (asset) => temperatures.get(asset) ?? COOL_TEMPERATURE,
    });
    await expectAssetColor(page, WATCHED_ASSET, HOT_COLOR, 30_000);
    await expect(page.getByTestId('asset-online')).toHaveText('online');

    // the readings table answers for a past moment, before this asset went hot
    const history = await fetch(
      `${AGORA}/documents/${seed.documentId}/assets/at?t=${encodeURIComponent(beforeHotReading)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(history.status, await history.clone().text()).toBe(200);
    const { assets } = await history.json();
    const watched = assets.find((asset) => asset.asset === WATCHED_ASSET);
    expect(watched, `${WATCHED_ASSET} has no reading at ${beforeHotReading}`).toBeTruthy();
    const temperature = watched.values.find((value) => value.kind === 'temperature');
    expect(temperature.value).toBeLessThan(25);
  });
});
