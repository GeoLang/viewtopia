// Seed the digital twin demo: twelve point assets in ptolemy, a fresh agora
// document carrying them as a live layer, a threshold rule on temperature, and
// a feed token a producer can send readings with. Given a tileset url the
// document also carries the tiled model, and the rule colours its tile features
// instead of the points.
//
// Talks to ptolemy (PTOLEMY_URL, default http://localhost:3000) and to agora
// through the SPA's proxy (AGORA_URL, default http://localhost:5174/agora).
// With --from-asset the assets are the elements of a tiletopia IFC model, read
// through the SPA's proxy too (TILETOPIA_URL, default http://localhost:5174).
//
//   node scripts/seed-twin.mjs
//   node scripts/seed-twin.mjs --from-asset <tiletopia asset id> [--class IfcPump]...

import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { mintToken } from './platform-token.mjs';
import {
  branchFeatures,
  commit,
  ensureBranch,
  ensureDataset,
  existingKeys,
  pointWkbHex,
  ptolemyClient,
  regionAnchor,
} from './ptolemy-seed.mjs';

const DEFAULT_AGORA_URL = 'http://localhost:5174/agora';
const DEFAULT_TILETOPIA_URL = 'http://localhost:5174';

// tiletopia refuses a `top` above 1000
const ELEMENT_PAGE_SIZE = 1000;

// ptolemy keeps axum's 2 MiB request body limit on commits
const OPERATIONS_PER_COMMIT = 500;

/** Who the seed writes as, in ptolemy and in agora. */
const SEED_SUBJECT = 'twin-seed';

const DATASET_NAME = 'twin-assets';
const BRANCH_NAME = 'main';

/** The layer id in the live document, which is also the agent layer id on the map. */
const LAYER_ID = 'twin-assets';

/** The 3D tileset layer, whose tile features carry the same asset ids. */
const MODEL_LAYER_ID = 'twin-model';

const DOCUMENT_NAME = 'Twin site';
const FEED_NAME = 'site sensors';
const FEED_INTERVAL_SECONDS = 2;

const ASSET_COUNT = 12;
const ASSETS_PER_ROW = 4;
/** ~40m between assets, so the twelve sit inside one screen at building zoom. */
const ASSET_SPACING_DEGREES = 0.0005;

const ASSET_TYPES = ['chiller', 'pump', 'air handler'];

function temperatureRule(layerId) {
  return {
    layerId,
    kind: 'temperature',
    breakpoints: [
      { value: 0, color: '#2ecc71' },
      { value: 25, color: '#f1c40f' },
      { value: 30, color: '#e74c3c' },
    ],
    defaultColor: '#95a5a6',
    offlineColor: '#7f8c8d',
  };
}

/** generateIndexBetween(null, null): the only layer in the document sorts first. */
const FIRST_LAYER_ORDER = 'V';
/** generateIndexBetween('V', null): the model sorts after the assets. */
const SECOND_LAYER_ORDER = 'l';

/** Marker for the token on a websocket handshake, see src/lib/apiAuth.ts. */
const BEARER_SUBPROTOCOL = 'bearer';

const SOCKET_TIMEOUT_MS = 15_000;

export function assetId(index) {
  return `TWIN-${String(index + 1).padStart(2, '0')}`;
}

export function assetName(index) {
  return `Unit ${index + 1}`;
}

/** The ids the demo uses when the caller has none of its own. */
export function defaultAssetIds() {
  return Array.from({ length: ASSET_COUNT }, (_entry, index) => assetId(index));
}

/**
 * The assets as GeoJSON, laid out in a grid from the region anchor. The ids come
 * from the caller when the tiles carry ids of their own, and a ptolemy feature
 * and a tile feature are the same asset when they share one.
 */
export function buildTwinFeatures([anchorLng, anchorLat], assetIds = defaultAssetIds()) {
  const features = [];
  for (let index = 0; index < assetIds.length; index += 1) {
    const lng = anchorLng + (index % ASSETS_PER_ROW) * ASSET_SPACING_DEGREES;
    const lat = anchorLat + Math.floor(index / ASSETS_PER_ROW) * ASSET_SPACING_DEGREES;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        asset_id: assetIds[index],
        name: assetName(index),
        type: ASSET_TYPES[index % ASSET_TYPES.length],
      },
    });
  }
  return features;
}

async function agoraRequest(agoraUrl, path, token, init) {
  const response = await fetch(`${agoraUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Send the operations on the document socket and wait for each ack, so the
 * script only reports success once agora has ordered them.
 */
function sendOperations(agoraUrl, documentId, token, operations) {
  const url = `${agoraUrl.replace(/^http/, 'ws')}/ws?doc=${encodeURIComponent(documentId)}`;
  const socket = new WebSocket(url, [BEARER_SUBPROTOCOL, token]);
  return new Promise((resolve, reject) => {
    const acked = new Set();
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`agora acked ${acked.size} of ${operations.length} operations`));
    }, SOCKET_TIMEOUT_MS);
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`the document socket could not open ${url}`));
    });
    socket.addEventListener('open', () => {
      operations.forEach((operation, index) => {
        socket.send(JSON.stringify({ type: 'op', clientSeq: index + 1, ...operation }));
      });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'error') {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`agora refused an operation: ${message.reason}`));
        return;
      }
      if (message.type !== 'ack') return;
      acked.add(message.clientSeq);
      if (acked.size < operations.length) return;
      clearTimeout(timer);
      socket.close();
      resolve();
    });
  });
}

function insertOperations(features, presentAssetIds) {
  return features
    .filter((feature) => !presentAssetIds.has(feature.properties.asset_id))
    .map((feature) => ({
      type: 'insert',
      feature_id: randomUUID(),
      geometry_wkb_hex: pointWkbHex(...feature.geometry.coordinates),
      properties: feature.properties,
    }));
}

async function seedAssetFeatures(api, features) {
  const datasetId = await ensureDataset(api, DATASET_NAME, 'point');
  const branchId = await ensureBranch(api, datasetId, BRANCH_NAME);
  const operations = insertOperations(features, await existingKeys(api, branchId, 'asset_id'));
  if (operations.length > 0) await commit(api, branchId, `seed ${DATASET_NAME}`, operations);
  return { datasetId, branchId, inserted: operations.length };
}

const WKB_POINT = 1;

function rowPosition(row) {
  // ptolemy serves a row's geometry as the bytes of PostGIS ST_AsBinary
  const view = new DataView(Uint8Array.from(row.geometry_wkb).buffer);
  const littleEndian = view.getUint8(0) === 1;
  const type = view.getUint32(1, littleEndian);
  if (type !== WKB_POINT) throw new Error(`row ${row.id} has WKB type ${type}, not a 2D point`);
  return [view.getFloat64(5, littleEndian), view.getFloat64(13, littleEndian)];
}

// one ten-millionth of a degree is about one centimetre on the ground
const POSITION_TOLERANCE_DEGREES = 1e-7;

export function rowUpdate(row, feature) {
  const fieldsDiffer = Object.entries(feature.properties).some(
    ([key, value]) => row.properties[key] !== value,
  );
  const [longitude, latitude] = feature.geometry.coordinates;
  const [rowLongitude, rowLatitude] = rowPosition(row);
  const moved =
    Math.abs(longitude - rowLongitude) > POSITION_TOLERANCE_DEGREES ||
    Math.abs(latitude - rowLatitude) > POSITION_TOLERANCE_DEGREES;
  if (!fieldsDiffer && !moved) return null;
  // ptolemy updates replace the whole properties object
  return {
    type: 'update',
    feature_id: row.id,
    ...(fieldsDiffer ? { properties: { ...row.properties, ...feature.properties } } : {}),
    ...(moved ? { geometry_wkb_hex: pointWkbHex(longitude, latitude) } : {}),
  };
}

export async function syncAssetFeatures(api, datasetName, features) {
  const datasetId = await ensureDataset(api, datasetName, 'point');
  const branchId = await ensureBranch(api, datasetId, BRANCH_NAME);
  const rows = await branchFeatures(api, branchId);
  const modelFeatures = new Map(features.map((feature) => [feature.properties.asset_id, feature]));
  const deletes = rows
    .filter((row) => !modelFeatures.has(row.properties.asset_id))
    .map((row) => ({ type: 'delete', feature_id: row.id }));
  const keptRows = rows.filter((row) => modelFeatures.has(row.properties.asset_id));
  const updates = keptRows
    .map((row) => rowUpdate(row, modelFeatures.get(row.properties.asset_id)))
    .filter((update) => update !== null);
  const inserts = insertOperations(features, new Set(rows.map((row) => row.properties.asset_id)));
  const operations = [...deletes, ...updates, ...inserts];
  for (let start = 0; start < operations.length; start += OPERATIONS_PER_COMMIT) {
    const chunk = operations.slice(start, start + OPERATIONS_PER_COMMIT);
    await commit(api, branchId, `seed ${datasetName} from its model`, chunk);
  }
  return {
    datasetId,
    branchId,
    inserted: inserts.length,
    updated: updates.length,
    deleted: deletes.length,
    unchanged: keptRows.length - updates.length,
  };
}

export async function assetElements({ tiletopiaUrl, assetId, ifcClasses, token }) {
  const path = `/v1/assets/${encodeURIComponent(assetId)}/elements`;
  const query = new URLSearchParams({ top: String(ELEMENT_PAGE_SIZE) });
  if (ifcClasses.length > 0) {
    query.set('filter', JSON.stringify({ '@classFullName': { $in: ifcClasses } }));
  }
  const elements = [];
  let continuationToken;
  do {
    if (continuationToken) query.set('continuationToken', continuationToken);
    const response = await fetch(`${tiletopiaUrl.replace(/\/$/, '')}${path}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`GET ${path} -> ${response.status}: ${text}`);
    const page = JSON.parse(text);
    elements.push(...page.items);
    continuationToken = page.continuationToken;
  } while (continuationToken);
  return elements;
}

export function elementFeatures(elements) {
  // tiletopia locates only elements with geometry, the same ones the tiles carry
  const placed = elements.filter((element) => element.location);
  return {
    features: placed.map((element) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [element.location.center.longitude, element.location.center.latitude],
      },
      properties: {
        asset_id: element.id,
        name: element.label,
        class: element.ifcClass,
        storey: element.storey,
      },
    })),
    unplaced: elements.length - placed.length,
  };
}

function seedToken() {
  const token = mintToken({ role: 'editor', sub: SEED_SUBJECT });
  if (!token) throw new Error('PLATFORM_JWT_SECRET is not set, so agora would refuse the seed');
  return token;
}

function createDocument(agoraUrl, token, projectId) {
  return agoraRequest(agoraUrl, '/documents', token, {
    method: 'POST',
    body: JSON.stringify(projectId ? { name: DOCUMENT_NAME, projectId } : { name: DOCUMENT_NAME }),
  });
}

/** The tiled model as a layer every member loads for themselves. */
export function modelLayerEntry(tilesetUrl) {
  return {
    layerId: MODEL_LAYER_ID,
    name: 'Twin model',
    type: 'tiles3d',
    visible: true,
    opacity: 1,
    order: SECOND_LAYER_ORDER,
    source: { kind: 'tiles3d', url: tilesetUrl },
  };
}

/**
 * A document carrying the model and nothing else, for a caller that has to read
 * the asset ids off the tiles before it can seed the assets themselves.
 */
export async function seedTwinModel({
  agoraUrl = process.env.AGORA_URL ?? DEFAULT_AGORA_URL,
  tilesetUrl,
  projectId,
} = {}) {
  const token = seedToken();
  const document = await createDocument(agoraUrl, token, projectId);
  await sendOperations(agoraUrl, document.id, token, [
    { key: `layers/${MODEL_LAYER_ID}`, value: modelLayerEntry(tilesetUrl) },
  ]);
  return { documentId: document.id, modelLayerId: MODEL_LAYER_ID };
}

async function publishTwinDocument({ agoraUrl, token, documentId, assetLayerSource, tilesetUrl }) {
  const layerEntry = {
    layerId: LAYER_ID,
    name: 'Twin assets',
    type: 'geojson',
    visible: true,
    opacity: 1,
    order: FIRST_LAYER_ORDER,
    source: assetLayerSource,
  };
  const ruleLayerId = tilesetUrl ? MODEL_LAYER_ID : LAYER_ID;
  await sendOperations(agoraUrl, documentId, token, [
    { key: `layers/${LAYER_ID}`, value: layerEntry },
    ...(tilesetUrl ? [{ key: `layers/${MODEL_LAYER_ID}`, value: modelLayerEntry(tilesetUrl) }] : []),
    { key: 'assets/rule', value: temperatureRule(ruleLayerId) },
  ]);

  const feed = await agoraRequest(agoraUrl, `/documents/${documentId}/feeds`, token, {
    method: 'POST',
    body: JSON.stringify({ name: FEED_NAME, intervalSeconds: FEED_INTERVAL_SECONDS }),
  });
  return { feedId: feed.id, feedToken: feed.token, ruleLayerId };
}

/**
 * Writes the whole demo and answers what a test needs to drive it. The document
 * is new on every run, so readings from an earlier run never colour this one.
 * With a tileset url the model is a layer of it too, and the rule then names
 * the model, because the tile features carry the same asset ids as the points.
 */
export async function seedTwin({
  ptolemyUrl,
  agoraUrl = process.env.AGORA_URL ?? DEFAULT_AGORA_URL,
  projectId,
  tilesetUrl,
  assetIds = defaultAssetIds(),
} = {}) {
  const base = ptolemyUrl ? `${ptolemyUrl.replace(/\/$/, '')}/api/v1` : undefined;
  const api = ptolemyClient(SEED_SUBJECT, base);
  const token = seedToken();

  const { anchor } = await regionAnchor();
  const features = buildTwinFeatures(anchor, assetIds);
  const dataset = await seedAssetFeatures(api, features);

  const document = await createDocument(agoraUrl, token, projectId);
  const assetLayerSource = { kind: 'geojson', geojson: { type: 'FeatureCollection', features } };
  const feed = await publishTwinDocument({ agoraUrl, token, documentId: document.id, assetLayerSource, tilesetUrl });

  return {
    documentId: document.id,
    ...feed,
    assetIds: features.map((feature) => feature.properties.asset_id),
    layerId: LAYER_ID,
    ...(tilesetUrl ? { modelLayerId: MODEL_LAYER_ID } : {}),
    dataset,
  };
}

export async function seedTwinFromAsset({
  assetId,
  ifcClasses = [],
  tiletopiaUrl = process.env.TILETOPIA_URL ?? DEFAULT_TILETOPIA_URL,
  ptolemyUrl,
  agoraUrl = process.env.AGORA_URL ?? DEFAULT_AGORA_URL,
  projectId,
}) {
  const base = ptolemyUrl ? `${ptolemyUrl.replace(/\/$/, '')}/api/v1` : undefined;
  const api = ptolemyClient(SEED_SUBJECT, base);
  const token = seedToken();

  // tiletopia shows an owned asset's elements only to its owner and to admins
  const elementToken = mintToken({ role: 'admin', sub: SEED_SUBJECT });
  const elements = await assetElements({ tiletopiaUrl, assetId, ifcClasses, token: elementToken });
  const { features, unplaced } = elementFeatures(elements);
  if (features.length === 0) {
    const classes = ifcClasses.length > 0 ? ` of class ${ifcClasses.join(', ')}` : '';
    throw new Error(`asset ${assetId} has no elements${classes} with a location`);
  }
  const dataset = await syncAssetFeatures(api, `${DATASET_NAME}-${assetId}`, features);

  const document = await createDocument(agoraUrl, token, projectId);
  // agora refuses an operation value over 64 KiB
  const attachment = await agoraRequest(agoraUrl, `/documents/${document.id}/attachments`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/geo+json' },
    body: JSON.stringify({ type: 'FeatureCollection', features }),
  });
  const agoraPath = new URL(agoraUrl).pathname.replace(/\/$/, '');
  const assetLayerSource = { kind: 'url', url: `${agoraPath}${attachment.url}`, format: 'geojson' };
  // browsers read tiles same-origin through nginx
  const tilesetUrl = `/tiles/v1/assets/${assetId}/tileset.json`;
  const feed = await publishTwinDocument({ agoraUrl, token, documentId: document.id, assetLayerSource, tilesetUrl });

  return {
    documentId: document.id,
    ...feed,
    assetIds: features.map((feature) => feature.properties.asset_id),
    unplaced,
    layerId: LAYER_ID,
    modelLayerId: MODEL_LAYER_ID,
    dataset,
  };
}

function seedFromCommandLine() {
  const { values } = parseArgs({
    options: {
      'from-asset': { type: 'string' },
      class: { type: 'string', multiple: true },
    },
  });
  if (values['from-asset'] === undefined) {
    if (values.class) throw new Error('--class needs --from-asset');
    return seedTwin();
  }
  return seedTwinFromAsset({ assetId: values['from-asset'], ifcClasses: values.class ?? [] });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve()
    .then(seedFromCommandLine)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((failure) => {
      console.error(failure.message);
      process.exit(1);
    });
}
