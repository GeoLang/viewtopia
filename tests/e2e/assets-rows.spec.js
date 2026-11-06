import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, allowConsoleError } from './console-guard';
import { PANEL, MENU_ITEM } from './panel-helpers';
import { mintToken } from '../../scripts/platform-token.mjs';

const BROWSER_USER = 'assets-rows-e2e';
const ASSETS_URL = 'http://localhost:5174/tiles/v1/assets';
const NAME_PREFIX = 'assets-rows-e2e';
const RUN_NAME = `${NAME_PREFIX}-${Date.now()}`;
const TILING_TIMEOUT_MS = 150_000;
const TEST_TIMEOUT_MS = 300_000;
const ACTION_TIMEOUT_MS = 30_000;

const JP2_FIXTURE = fileURLToPath(new URL('./fixtures/assets_orthophoto.jp2', import.meta.url));
const PNG_FIXTURE = fileURLToPath(new URL('./fixtures/assets_orthophoto.png', import.meta.url));
const IFC_FIXTURE = fileURLToPath(new URL('./fixtures/twin_boxes.ifc', import.meta.url));

// tiletopia reads an hgt's place from its file name, so this name holds no run stamp
const DEM_NAME = 'N45E012.hgt';
const SRTM3_SIDE = 1201;

const MODEL_PLACEMENT = { Longitude: '12.35', Latitude: '45.45' };
const PNG_PLACEMENT = { Bounds: '12.3,45.4,12.4,45.5', CRS: 'EPSG:4326' };

const CZML_DOCUMENT = [
  { id: 'document', name: 'assets-rows', version: '1.0' },
  {
    id: 'marker',
    position: { cartographicDegrees: [12.35, 45.45, 0] },
    point: { pixelSize: 10 },
  },
];

function bearer() {
  return { Authorization: `Bearer ${mintToken({ role: 'editor', sub: BROWSER_USER })}` };
}

function czmlFile() {
  return {
    name: `${RUN_NAME}.czml`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(CZML_DOCUMENT)),
  };
}

async function jp2File() {
  return {
    name: `${RUN_NAME}.jp2`,
    mimeType: 'image/jp2',
    buffer: await readFile(JP2_FIXTURE),
  };
}

async function pngFile() {
  return {
    name: `${RUN_NAME}.png`,
    mimeType: 'image/png',
    buffer: await readFile(PNG_FIXTURE),
  };
}

async function ifcFile() {
  return {
    name: `${RUN_NAME}.ifc`,
    mimeType: 'application/octet-stream',
    buffer: await readFile(IFC_FIXTURE),
  };
}

function demFile() {
  const buffer = Buffer.alloc(SRTM3_SIDE * SRTM3_SIDE * 2);
  for (let sample = 0; sample < SRTM3_SIDE * SRTM3_SIDE; sample += 1) {
    buffer.writeInt16BE(100 + (sample % SRTM3_SIDE), sample * 2);
  }
  return { name: DEM_NAME, mimeType: 'application/octet-stream', buffer };
}

async function deleteLeftovers() {
  const response = await fetch(ASSETS_URL, { headers: bearer() });
  const assets = await response.json();
  const leftovers = assets.filter((a) => a.name.startsWith(NAME_PREFIX) || a.name === DEM_NAME);
  for (const asset of leftovers) {
    await fetch(`${ASSETS_URL}/${asset.id}`, { method: 'DELETE', headers: bearer() });
  }
}

async function openViewer(page) {
  await page.addInitScript(
    (session) => {
      localStorage.setItem('viewtopia-tour-done', '1');
      localStorage.setItem('viewtopia-first-run', 'dismissed');
      localStorage.setItem('viewtopia_auth', JSON.stringify(session));
      localStorage.setItem(
        'viewtopia-app',
        JSON.stringify({ state: { renderer: 'cesium' }, version: 0 }),
      );
    },
    { user: { name: BROWSER_USER }, token: mintToken({ role: 'editor', sub: BROWSER_USER }) },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__viewtopiaViewer, null, { timeout: 60_000 });
}

async function openPanel(page, label, text) {
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator(MENU_ITEM).filter({ hasText: label }).first().click();
  await expect(page.locator('[class*="mantine-Menu-dropdown"]')).toHaveCount(0);
  const panel = page.locator(PANEL).filter({ hasText: text });
  await expect(panel).toHaveCount(1);
  return panel;
}

async function openAssets(page) {
  await openViewer(page);
  // a tile in flight when its asset is deleted answers 404, and chrome logs that
  allowConsoleError(page, /Failed to load resource.*\/(assets|terrain\/bundles)\//);
  return openPanel(page, 'Assets', 'Upload and tile');
}

async function uploadUntilReady(page, panel, file, placement) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/tiles/v1/assets',
    { timeout: 60_000 },
  );
  await panel.locator('input[type="file"]').setInputFiles(file);
  if (placement) {
    for (const [label, value] of Object.entries(placement)) {
      await panel.getByLabel(label).fill(value);
    }
    await panel.getByRole('button', { name: 'Upload file' }).click();
  }
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const { id } = await response.json();
  const row = panel.getByTestId(`assets-row-${id}`);
  await expect(row).toContainText('ready', { timeout: TILING_TIMEOUT_MS });
  return { id, name: file.name, row };
}

async function deleteAsset(asset) {
  await asset.row.getByRole('button', { name: `Delete ${asset.name}` }).click();
  await asset.row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(asset.row).toHaveCount(0);
}

const dataSourceCount = (page) =>
  page.evaluate(() => window.__viewtopiaViewer.dataSources.length);

const imageryLayerCount = (page) =>
  page.evaluate(() => window.__viewtopiaViewer.imageryLayers.length);

const tilesetCount = (page) =>
  page.evaluate(() => {
    const { primitives } = window.__viewtopiaViewer.scene;
    let count = 0;
    for (let index = 0; index < primitives.length; index += 1) {
      // 3D tilesets have a root tile and other primitives do not
      if (primitives.get(index)?.root) count += 1;
    }
    return count;
  });

const terrainInUse = (page) =>
  page.evaluate(() => {
    const provider = window.__viewtopiaViewer.terrainProvider;
    return {
      // CesiumTerrainProvider is the only provider with the vertex-normal request flag
      quantizedMesh: 'requestVertexNormals' in provider,
      url: provider._layers?.[0]?.resource?.url ?? null,
    };
  });

const NO_TERRAIN = { quantizedMesh: false, url: null };

function pollValue(read, page) {
  return expect.poll(() => read(page), { timeout: ACTION_TIMEOUT_MS });
}

function bundleResponses(page) {
  const responses = [];
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith('/tiles/v1/terrain/bundles/')) {
      responses.push({ pathname, status: response.status() });
    }
  });
  return responses;
}

function runAction(page, params, options) {
  return page.evaluate(
    ([action, runOptions]) => window.__viewtopiaRunAction(action, runOptions),
    [params, options],
  );
}

async function callTool(page, name, args) {
  const response = await page.request.post(`/agent/tools/${name}`, {
    headers: bearer(),
    data: { args },
  });
  expect(response.status()).toBe(200);
  const { result } = await response.json();
  return result;
}

function actionOnLine(listing, id) {
  const line = listing.split('\n').find((candidate) => candidate.includes(id));
  expect(line, `no line for ${id} in:\n${listing}`).toBeTruthy();
  const [, name, argumentText] = /→ (\S+) with (.+?)(?:\. |$)/.exec(line);
  const argumentPairs = argumentText.split(' and ').map((argument) => {
    const space = argument.indexOf(' ');
    return [argument.slice(0, space), argument.slice(space + 1)];
  });
  return { name, args: Object.fromEntries(argumentPairs) };
}

test.beforeAll(async () => {
  expect(mintToken(), 'the stack must be running with a platform secret').not.toBeNull();
  await deleteLeftovers();
});

test('a CZML row adds and removes its data source, and delete takes it off', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const before = await dataSourceCount(page);

  const asset = await uploadUntilReady(page, panel, czmlFile());
  await asset.row.getByRole('button', { name: `Add ${asset.name} to globe` }).click();
  await pollValue(dataSourceCount, page).toBe(before + 1);

  await asset.row.getByRole('button', { name: `Remove ${asset.name} from globe` }).click();
  await pollValue(dataSourceCount, page).toBe(before);

  await asset.row.getByRole('button', { name: `Add ${asset.name} to globe` }).click();
  await pollValue(dataSourceCount, page).toBe(before + 1);

  await deleteAsset(asset);
  await pollValue(dataSourceCount, page).toBe(before);
});

test('a .jp2 row adds imagery, its WMTS url serves a layer, and delete takes both off', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const before = await imageryLayerCount(page);

  const asset = await uploadUntilReady(page, panel, await jp2File(), {});
  const addLayer = asset.row.getByRole('button', { name: `Add ${asset.name} as a map layer` });
  await addLayer.click();
  await pollValue(imageryLayerCount, page).toBe(before + 1);
  await expect(addLayer).toBeDisabled();

  await asset.row.getByRole('button', { name: `Service URLs of ${asset.name}` }).click();
  const capabilitiesUrl = await asset.row.getByLabel('WMTS capabilities', { exact: true }).inputValue();
  const capabilities = await page.request.get(capabilitiesUrl);
  expect(capabilities.status()).toBe(200);
  const template = /<ResourceURL[^>]*template="([^"]+)"/.exec(await capabilities.text())?.[1];
  expect(template, 'the capabilities document names no tile template').toBeTruthy();

  await runAction(page, {
    name: 'data.add_service',
    args: { type: 'wmts', url: template, layer_name: `${asset.name} WMTS` },
  });
  await pollValue(imageryLayerCount, page).toBe(before + 2);

  await deleteAsset(asset);
  await pollValue(imageryLayerCount, page).toBe(before);
});

test('a .png placed by bounds and crs adds imagery, and delete takes it off', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const before = await imageryLayerCount(page);

  const asset = await uploadUntilReady(page, panel, await pngFile(), PNG_PLACEMENT);
  await asset.row.getByRole('button', { name: `Add ${asset.name} as a map layer` }).click();
  await pollValue(imageryLayerCount, page).toBe(before + 1);

  await deleteAsset(asset);
  await pollValue(imageryLayerCount, page).toBe(before);
});

test('a model row adds a tileset, and delete takes it off', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const before = await tilesetCount(page);

  const asset = await uploadUntilReady(page, panel, await ifcFile(), MODEL_PLACEMENT);
  await asset.row.getByRole('button', { name: `Add ${asset.name} to globe` }).click();
  await pollValue(tilesetCount, page).toBe(before + 1);

  await deleteAsset(asset);
  await pollValue(tilesetCount, page).toBe(before);
});

test('a DEM row and terrain.set_asset draw its terrain, and a bundle that is not there fails', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const responses = bundleResponses(page);

  const asset = await uploadUntilReady(page, panel, demFile());
  const bundle = `/tiles/v1/terrain/bundles/${asset.id}/`;
  const terrainTiles = () =>
    responses.filter((r) => r.pathname.startsWith(bundle) && r.pathname.endsWith('.terrain'));

  await asset.row.getByRole('button', { name: `Use ${asset.name} as globe terrain` }).click();
  await pollValue(terrainInUse, page).toEqual({
    quantizedMesh: true,
    url: expect.stringContaining(bundle),
  });
  await expect.poll(() => terrainTiles().length, { timeout: ACTION_TIMEOUT_MS }).toBeGreaterThan(0);
  expect(terrainTiles().filter((tile) => tile.status !== 200)).toEqual([]);

  await page.evaluate(() => {
    window.__assetsRowsProvider = window.__viewtopiaViewer.terrainProvider;
  });
  await runAction(page, { name: 'terrain.set_asset', args: { asset_id: asset.id } });
  expect(
    await page.evaluate(
      () => window.__viewtopiaViewer.terrainProvider !== window.__assetsRowsProvider,
    ),
  ).toBe(true);
  await pollValue(terrainInUse, page).toEqual({
    quantizedMesh: true,
    url: expect.stringContaining(bundle),
  });

  await deleteAsset(asset);
  await pollValue(terrainInUse, page).toEqual(NO_TERRAIN);

  for (const missingId of [asset.id, randomUUID()]) {
    const layerJson = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/tiles/v1/terrain/bundles/${missingId}/layer.json`,
    );
    await runAction(
      page,
      { name: 'terrain.set_asset', args: { asset_id: missingId } },
      { announce: false },
    );
    expect((await layerJson).status()).toBe(404);
    expect(await terrainInUse(page)).toEqual(NO_TERRAIN);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('viewtopia-chat')))
      .toContain(`terrain ${missingId} did not load`);
  }
});

test('every action list_tilesets names passes viewer_control and draws in the viewer', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const panel = await openAssets(page);
  const imageryBefore = await imageryLayerCount(page);
  const tilesetsBefore = await tilesetCount(page);

  const imagery = await uploadUntilReady(page, panel, await jp2File(), {});
  const model = await uploadUntilReady(page, panel, await ifcFile(), MODEL_PLACEMENT);
  const dem = await uploadUntilReady(page, panel, demFile());

  const listing = await callTool(page, 'list_tilesets', {});
  for (const asset of [imagery, model, dem]) {
    const { name, args } = actionOnLine(listing, asset.id);
    const command = await callTool(page, 'viewer_control', { action: 'run', name, ...args });
    expect(command, `viewer_control refused ${name}`).toContain('__VIEWER_CMD__:');
    const { params } = JSON.parse(command.slice(command.indexOf(':') + 1));
    expect(params.name).toBe(name);
    await runAction(page, params);
  }

  await pollValue(imageryLayerCount, page).toBe(imageryBefore + 1);
  await pollValue(tilesetCount, page).toBe(tilesetsBefore + 1);
  await pollValue(terrainInUse, page).toEqual({
    quantizedMesh: true,
    url: expect.stringContaining(`/tiles/v1/terrain/bundles/${dem.id}/`),
  });

  await deleteAsset(imagery);
  await deleteAsset(model);
  await deleteAsset(dem);
  await pollValue(imageryLayerCount, page).toBe(imageryBefore);
  await pollValue(tilesetCount, page).toBe(tilesetsBefore);
  await pollValue(terrainInUse, page).toEqual(NO_TERRAIN);
});

test('Global Terrain shows the variables an unconfigured stack names in its 503', async ({
  page,
}) => {
  const probe = await page.request.get('/tiles/v1/terrain/global/layer.json');
  test.skip(probe.status() !== 503, 'this stack sets TILETOPIA_GLOBAL_TERRAIN_*');

  allowConsoleError(page, /Terrain provider failed/);
  allowConsoleError(page, /Failed to load resource.*terrain\/global\/layer\.json/);
  await openViewer(page);
  const panel = await openPanel(page, 'Terrain', 'Global Terrain');

  await panel.getByRole('textbox', { name: 'Provider' }).click();
  await page.getByRole('option', { name: 'Global terrain' }).click();
  await panel.getByRole('button', { name: 'Enable Terrain' }).click();

  await expect(panel.getByTestId('terrain-status')).toContainText(
    'TILETOPIA_GLOBAL_TERRAIN_DEM_URL',
  );
  expect(await terrainInUse(page)).toEqual(NO_TERRAIN);
});
