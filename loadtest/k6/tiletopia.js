// tiletopia 3D Tiles serving: the tileset manifest and a content tile.
//
// tiletopia has no loadtest seeder of its own, so this measures whatever assets
// the stack already holds (the demo assets it registers on start). With no
// assets the ops are skipped and the run reports the gap instead of failing,
// because an empty catalog is a seeding gap, not a regression.

import { BASE, get, probe, scenario, summaryTo, thresholds } from './lib.js';

const TILES = `${BASE}/tiles/v1`;

const SPECS = [
  { op: 'tileset', target: 'asset', p95: 1000 },
  { op: 'tile', target: 'asset', p95: 2000 },
];

export const options = {
  scenarios: scenario('tiletopia'),
  thresholds: thresholds(SPECS),
};

// Pick the first asset that serves a tileset.json, and pull one tile URI out of
// it so the tile op requests something the manifest actually references.
export function setup() {
  const list = probe(`${TILES}/assets`);
  if (list.status !== 200) {
    console.warn(`GET /tiles/v1/assets -> ${list.status}: no tiletopia targets, ops skipped`);
    return {};
  }
  const assets = list.json();
  const items = Array.isArray(assets) ? assets : assets.assets || [];
  for (const asset of items) {
    const res = probe(`${TILES}/assets/${asset.id}/tileset.json`);
    if (res.status !== 200) continue;
    return { asset: asset.id, tile: firstTileUri(res.json()) };
  }
  console.warn('no tiletopia asset serves a tileset.json, ops skipped (seeding gap)');
  return {};
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
