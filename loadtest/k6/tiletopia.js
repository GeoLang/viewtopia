// tiletopia 3D Tiles serving: the tileset manifest and a content tile.
//
// The target is the asset loadtest/seed.mjs uploads, resolved by name. Measuring
// whichever asset the catalog happened to hold would compare a different tileset
// every run, and would find nothing at all on a fresh stack. Without the seeder
// the ops are skipped and the run says so, because a missing fixture is a seeding
// gap, not a regression.

import { BASE, get, probe, scenario, summaryTo, thresholds } from './lib.js';
import { TILESET_ASSET } from '../geo.js';

const TILES = `${BASE}/tiles/v1`;

const SPECS = [
  { op: 'tileset', target: 'asset', p95: 50 },
  { op: 'tile', target: 'asset', p95: 50 },
];

export const options = {
  scenarios: scenario('tiletopia'),
  thresholds: thresholds(SPECS),
};

// Resolve the seeded asset, and pull one tile URI out of its manifest so the tile
// op requests something the manifest actually references.
export function setup() {
  const list = probe(`${TILES}/assets`);
  if (list.status !== 200) {
    console.warn(`GET /tiles/v1/assets -> ${list.status}: no tiletopia targets, ops skipped`);
    return {};
  }
  const assets = list.json();
  const items = Array.isArray(assets) ? assets : assets.assets || [];
  const seeded = items.find((a) => a.name === TILESET_ASSET && a.status === 'ready');
  if (!seeded) {
    console.warn(`target ${TILESET_ASSET} is not seeded, its ops will be skipped`);
    return {};
  }
  const res = probe(`${TILES}/assets/${seeded.id}/tileset.json`);
  if (res.status !== 200) {
    console.warn(`${TILESET_ASSET} is ready but its tileset.json -> ${res.status}, ops skipped`);
    return {};
  }
  return { asset: seeded.id, tile: firstTileUri(res.json()) };
}

// Depth-first walk for the first content uri in the tileset tree.
function firstTileUri(tileset) {
  const stack = tileset && tileset.root ? [tileset.root] : [];
  while (stack.length) {
    const node = stack.pop();
    if (node.content && node.content.uri) return node.content.uri;
    for (const child of node.children || []) stack.push(child);
  }
  return null;
}

export default function (data) {
  if (!data.asset) return;
  get(SPECS[0], `${TILES}/assets/${data.asset}/tileset.json`);
  // content uris are relative to the tileset.json, and already carry their own
  // "tiles/" segment, so the asset base is the only prefix to add
  if (data.tile) get(SPECS[1], `${TILES}/assets/${data.asset}/${data.tile}`);
}

export const handleSummary = summaryTo(`${__ENV.LOADTEST_OUT || 'out'}/tiletopia.json`);
