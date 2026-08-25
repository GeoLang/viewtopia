import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from './console-guard';
import { mintToken } from '../../scripts/platform-token.mjs';
import { regionAnchor } from '../../scripts/ptolemy-seed.mjs';
import { assetName, seedTwin, seedTwinModel } from '../../scripts/seed-twin.mjs';
import { startProducer } from './fixtures/twin-producer.mjs';

/**
 * The digital twin on the globe: tiletopia tiles an IFC whose elements carry
 * their GlobalId as `asset_id`, the model becomes a layer of a live map, and the
 * document's threshold rule colours its tile features from the readings a node
 * producer sends. A pick resolves the tile feature to the ptolemy asset.
 *
 *   docker compose -f docker-compose.platform.yml --env-file .env.platform up -d
 *   npx playwright test -c playwright.platform.config.js tests/e2e/digital-twin-3d.spec.js
 *
 * The IFC reader has to write EXT_structural_metadata, so this needs a tiletopia
 * image built from a master that does. Its tileset.json also has to carry a
 * non-zero geometricError: Cesium's traversal returns before the root when the
 * tileset's own geometric error is 0, so nothing is requested and nothing draws.
 */

const PTOLEMY = 'http://localhost:3000';
const AGORA = 'http://localhost:5174/agora';
const TILES = 'http://localhost:5174/tiles/v1';

const BROWSER_USER = 'twin3d-e2e-browser';
const SEED_USER = 'twin-seed';

const FIXTURE_IFC = fileURLToPath(new URL('./fixtures/twin_boxes.ifc', import.meta.url));
const FIXTURE_ASSET_IDS = fileURLToPath(new URL('./fixtures/twin_boxes.json', import.meta.url));

const COOL_TEMPERATURE = 21;
const HOT_TEMPERATURE = 31;

// the seeded rule's colours
const COOL_COLOR = '#2ecc71';
const HOT_COLOR = '#e74c3c';
const OFFLINE_COLOR = '#7f8c8d';

const PRODUCER_INTERVAL_MS = 1000;

/** Agora marks an asset offline after three missed 2s intervals. */
const OFFLINE_TIMEOUT_MS = 10_000;

const TILING_TIMEOUT_MS = 120_000;
const TILESET_TIMEOUT_MS = 60_000;
const COLOR_TIMEOUT_MS = 30_000;

/** Pixels between the points the spec pick scans the canvas at. */
const PICK_SCAN_STEP = 40;

function authHeaders(user) {
  return { Authorization: `Bearer ${mintToken({ role: 'editor', sub: user })}` };
}

/** Why the tiling job for this asset stopped, as tiletopia recorded it. */
async function tilingError(assetId) {
  const response = await fetch(`${TILES}/assets/${assetId}/jobs`, {
    headers: authHeaders(BROWSER_USER),
  });
  const jobs = await response.json();
  return jobs?.[0]?.error ?? 'no reason recorded';
}

/**
 * Upload the model where the seeded assets are and wait for tiletopia to tile
 * it, answering its tileset url. The IFC carries no site coordinates, so the
 * upload is what places it on the globe.
 */
async function tileFixtureModel([longitude, latitude]) {
  const form = new FormData();
  form.append('name', `twin-boxes-${Date.now()}.ifc`);
  form.append('longitude', String(longitude));
  form.append('latitude', String(latitude));
  form.append('file', new Blob([await readFile(FIXTURE_IFC)]), 'twin_boxes.ifc');
  const upload = await fetch(`${TILES}/assets`, {
    method: 'POST',
    headers: authHeaders(BROWSER_USER),
    body: form,
  });
  expect(upload.status, await upload.clone().text()).toBe(201);
  const { id } = await upload.json();

  await expect
    .poll(
      async () => {
        const response = await fetch(`${TILES}/assets/${id}`, {
          headers: authHeaders(BROWSER_USER),
        });
        const { status } = await response.json();
        if (status === 'error') throw new Error(`tiling failed: ${await tilingError(id)}`);
        return status;
      },
      { timeout: TILING_TIMEOUT_MS, intervals: [2000] },
    )
    .toBe('ready');

  // the browser reads it same-origin through nginx, so the document carries the path
  return `/tiles/v1/assets/${id}/tileset.json`;
}

async function addEditMember(documentId, userId) {
  const response = await fetch(
    `${AGORA}/documents/${documentId}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders(SEED_USER) },
      body: JSON.stringify({ role: 'edit' }),
    },
  );
  expect(response.status, await response.text()).toBeLessThan(300);
}

/** Open a live document on the Cesium globe, which is where a tileset draws. */
async function openDocument(page, documentId) {
  await addEditMember(documentId, BROWSER_USER);
  await page.addInitScript((session) => {
    localStorage.setItem('viewtopia-tour-done', '1');
    localStorage.setItem('viewtopia-first-run', 'dismissed');
    localStorage.setItem('viewtopia_auth', JSON.stringify(session));
    localStorage.setItem(
      'viewtopia-app',
      JSON.stringify({ state: { renderer: 'cesium' }, version: 0 }),
    );
  }, { user: { name: BROWSER_USER }, token: mintToken({ role: 'editor', sub: BROWSER_USER }) });
  await page.goto(`/?doc=${documentId}`);
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60_000 });
}

/**
 * Whether the model is on the globe. A root tile is what a 3D tileset has and no
 * other primitive does, and `fromUrl` only answers with a loaded tileset, so
 * being in the scene at all is being ready.
 */
function tilesetOnGlobe(page) {
  return page.evaluate(() => {
    const primitives = window.__viewtopiaViewer?.scene?.primitives;
    if (!primitives) return false;
    for (let index = 0; index < primitives.length; index += 1) {
      if (primitives.get(index)?.root) return true;
    }
    return false;
  });
}

async function waitForTileset(page) {
  await expect.poll(() => tilesetOnGlobe(page), { timeout: TILESET_TIMEOUT_MS }).toBe(true);
  const framed = await page.evaluate(async () => {
    const viewer = window.__viewtopiaViewer;
    const primitives = viewer.scene.primitives;
    for (let index = 0; index < primitives.length; index += 1) {
      const primitive = primitives.get(index);
      if (!primitive?.root) continue;
      await viewer.flyTo(primitive, { duration: 0 });
      return true;
    }
    return false;
  });
  expect(framed, 'no tileset on the globe to fly to').toBe(true);
}

/** The colour the tileset's style gives one asset, straight from its conditions. */
function assetColor(page, assetId) {
  return page.evaluate((asset) => {
    const primitives = window.__viewtopiaViewer?.scene?.primitives;
    if (!primitives) return null;
    for (let index = 0; index < primitives.length; index += 1) {
      const conditions = primitives.get(index)?.style?.style?.color?.conditions;
      if (!Array.isArray(conditions)) continue;
      const match = conditions.find(([test]) => String(test).includes(`"${asset}"`));
      if (match) return match[1];
    }
    return null;
  }, assetId);
}

function expectAssetColor(page, assetId, color, timeout) {
  return expect
    .poll(() => assetColor(page, assetId), { timeout, intervals: [200] })
    .toContain(color);
}

/** The asset ids the tiles carry, read off the loaded tiles themselves. */
function assetIdsOnGlobe(page) {
  return page.evaluate(() => {
    const primitives = window.__viewtopiaViewer?.scene?.primitives;
    const ids = [];
    const walk = (tile) => {
      const content = tile?.content;
      const count = content?.featuresLength ?? 0;
      for (let index = 0; index < count; index += 1) {
        const id = content.getFeature(index)?.getProperty('asset_id');
        if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
      }
      for (const child of tile?.children ?? []) walk(child);
    };
    for (let index = 0; index < (primitives?.length ?? 0); index += 1) {
      const primitive = primitives.get(index);
      if (primitive?.root) walk(primitive.root);
    }
    return ids;
  });
}

/** A canvas point with a tile feature under it, and the asset that feature is. */
function pickPoint(page, step) {
  return page.evaluate((scanStep) => {
    const viewer = window.__viewtopiaViewer;
    const canvas = viewer?.scene?.canvas;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    for (let y = scanStep; y < bounds.height; y += scanStep) {
      for (let x = scanStep; x < bounds.width; x += scanStep) {
        const picked = viewer.scene.pick({ x, y });
        const assetId = picked?.getProperty?.('asset_id');
        if (typeof assetId === 'string') {
          return { assetId, x: bounds.x + x, y: bounds.y + y };
        }
      }
    }
    return null;
  }, step);
}

/**
 * The ids the tiles carry. The fixture beside the model says, and a model built
 * with other ids answers for itself once its tiles are on the globe.
 */
async function tileAssetIds(page, tilesetUrl) {
  const listed = await readFile(FIXTURE_ASSET_IDS, 'utf8').catch(() => null);
  if (listed) return JSON.parse(listed);

  const probe = await seedTwinModel({ agoraUrl: AGORA, tilesetUrl });
  await openDocument(page, probe.documentId);
  await waitForTileset(page);
  const ids = await assetIdsOnGlobe(page);
  expect(ids.length, 'the tiles carry no asset ids').toBeGreaterThan(0);
  return ids;
}

test.describe('digital twin on the globe — live platform stack', () => {
  let producer = null;

  test.afterEach(() => {
    producer?.stop();
    producer = null;
  });

  test('readings recolour the tiled model and a pick resolves to its asset', async ({ page }) => {
    test.setTimeout(360_000);
    expect(mintToken(), 'the stack must be running with a platform secret').not.toBeNull();

    const { anchor } = await regionAnchor();
    const tilesetUrl = await tileFixtureModel(anchor);
    const assetIds = await tileAssetIds(page, tilesetUrl);

    const seed = await seedTwin({ ptolemyUrl: PTOLEMY, agoraUrl: AGORA, tilesetUrl, assetIds });
    expect(seed.ruleLayerId).toBe(seed.modelLayerId);

    await openDocument(page, seed.documentId);
    await waitForTileset(page);

    const temperatures = new Map();
    producer = await startProducer({
      agoraUrl: AGORA,
      feedToken: seed.feedToken,
      assetIds,
      intervalMs: PRODUCER_INTERVAL_MS,
      valueFor: (asset) => temperatures.get(asset) ?? COOL_TEMPERATURE,
    });

    await expectAssetColor(page, assetIds[0], COOL_COLOR, COLOR_TIMEOUT_MS);
    expect(producer.errors).toEqual([]);

    // Inspect is the picking mode, so the button arms it on its own. It opens
    // before the point is scanned for, so the panel cannot move the canvas after
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByLabel('Click a feature to inspect')).toBeChecked();

    // the box the click lands on decides which asset the rest follows, so the
    // inspector and the colour are answering for the same one
    let picked = null;
    await expect
      .poll(
        async () => {
          picked = await pickPoint(page, PICK_SCAN_STEP);
          return picked !== null;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBe(true);
    const watched = picked.assetId;
    expect(assetIds).toContain(watched);

    temperatures.set(watched, HOT_TEMPERATURE);
    producer.send([
      { asset: watched, kind: 'temperature', value: HOT_TEMPERATURE, at: new Date().toISOString() },
    ]);
    await expectAssetColor(page, watched, HOT_COLOR, COLOR_TIMEOUT_MS);

    await page.mouse.click(picked.x, picked.y);

    const inspector = page.locator('div').filter({ hasText: /^Feature Info/ }).first();
    await expect(inspector).toContainText(watched);
    // the ptolemy asset's own attributes, beside the tile's
    await expect(inspector).toContainText(assetName(assetIds.indexOf(watched)));
    await expect(page.getByTestId('asset-reading-temperature')).toContainText(
      String(HOT_TEMPERATURE),
    );
    await expect(page.getByTestId('asset-online')).toHaveText('online');

    producer.stop();
    producer = null;
    await expectAssetColor(page, watched, OFFLINE_COLOR, OFFLINE_TIMEOUT_MS);
    await expect(page.getByTestId('asset-online')).toHaveText('offline');
  });
});
