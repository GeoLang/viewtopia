/**
 * Write a PMTiles v3 archive from GeoJSON, entirely in the browser: geojson-vt
 * cuts the tiles, vt-pbf encodes them as MVT, and the container is laid out
 * here per the spec (github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md):
 * 127-byte header, gzipped root directory in the first 16384 bytes, gzipped
 * JSON metadata, leaf directories when the root would overflow, tile data in
 * tile-id order (clustered).
 */
import geojsonvt from 'geojson-vt';
import { fromGeojsonVt } from 'vt-pbf';
import { gzipSync } from 'fflate';
import { zxyToTileId } from 'pmtiles';

export const EXPORT_MAX_ZOOM = 12;
/** A browser export is for layer-sized data, not planet basemaps. */
const TILE_CAP = 100_000;
/** The compressed root must sit inside the archive's first 16384 bytes. */
const ROOT_BYTE_LIMIT = 16384 - 127;
const LEAF_ENTRIES = 2048;

const GZIP = 2;
const MVT = 1;

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

/** Little-endian base-128 varint; float division carries past 32 bits. */
function writeVarint(value: number, out: number[]): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

/** Spec order: count, tile-id deltas, run lengths, lengths, offsets. */
function serializeDirectory(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  writeVarint(entries.length, out);
  let last = 0;
  for (const e of entries) {
    writeVarint(e.tileId - last, out);
    last = e.tileId;
  }
  for (const e of entries) writeVarint(e.runLength, out);
  for (const e of entries) writeVarint(e.length, out);
  for (const [i, e] of entries.entries()) {
    const prev = entries[i - 1];
    // 0 means contiguous with the previous entry, else the offset plus one
    if (prev && e.offset === prev.offset + prev.length) writeVarint(0, out);
    else writeVarint(e.offset + 1, out);
  }
  return new Uint8Array(out);
}

function setUint64(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true);
}

function bounds(geojson: GeoJSON.FeatureCollection): [number, number, number, number] {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
      return;
    }
    for (const inner of c) walk(inner);
  };
  for (const f of geojson.features) {
    walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** TileJSON field types for the metadata's vector_layers entry. */
function fieldTypes(geojson: GeoJSON.FeatureCollection): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const f of geojson.features) {
    for (const [key, value] of Object.entries(f.properties ?? {})) {
      if (fields[key] || value == null) continue;
      fields[key] =
        typeof value === 'number' ? 'Number' : typeof value === 'boolean' ? 'Boolean' : 'String';
    }
  }
  return fields;
}

/**
 * Cut and encode every non-empty tile from zoom 0 down. A tile empty in
 * geojson-vt has empty children too, so its whole subtree is skipped.
 */
function cutTiles(
  geojson: GeoJSON.FeatureCollection,
  layerName: string,
  maxZoom: number,
): { tileId: number; data: Uint8Array }[] {
  const index = geojsonvt(geojson, { maxZoom, indexMaxZoom: 0 });
  const tiles: { tileId: number; data: Uint8Array }[] = [];
  const stack: [number, number, number][] = [[0, 0, 0]];
  while (stack.length) {
    const [z, x, y] = stack.pop() as [number, number, number];
    const tile = index.getTile(z, x, y);
    if (!tile || tile.features.length === 0) continue;
    if (tiles.length >= TILE_CAP) {
      throw new Error(`more than ${TILE_CAP} tiles at zoom ${maxZoom}; export smaller data`);
    }
    const mvt = fromGeojsonVt({ [layerName]: tile }, { version: 2 });
    tiles.push({ tileId: zxyToTileId(z, x, y), data: gzipSync(mvt) });
    if (z < maxZoom) {
      stack.push([z + 1, 2 * x, 2 * y], [z + 1, 2 * x + 1, 2 * y]);
      stack.push([z + 1, 2 * x, 2 * y + 1], [z + 1, 2 * x + 1, 2 * y + 1]);
    }
  }
  return tiles;
}

export interface WriterOptions {
  maxZoom?: number;
  /** Test hooks: shrinking them forces the leaf-directory paths on small data. */
  rootByteLimit?: number;
  leafEntries?: number;
}

export function geojsonToPmtiles(
  geojson: GeoJSON.FeatureCollection,
  layerName: string,
  options: WriterOptions = {},
): Uint8Array<ArrayBuffer> {
  const maxZoom = options.maxZoom ?? EXPORT_MAX_ZOOM;
  const rootByteLimit = options.rootByteLimit ?? ROOT_BYTE_LIMIT;
  const leafEntries = options.leafEntries ?? LEAF_ENTRIES;
  const tiles = cutTiles(geojson, layerName, maxZoom);
  if (tiles.length === 0) throw new Error('no features to export');
  tiles.sort((a, b) => a.tileId - b.tileId);

  const entries: Entry[] = [];
  let tileOffset = 0;
  for (const tile of tiles) {
    entries.push({ tileId: tile.tileId, offset: tileOffset, length: tile.data.length, runLength: 1 });
    tileOffset += tile.data.length;
  }

  let rootDir = gzipSync(serializeDirectory(entries));
  let leafSection = new Uint8Array(0);
  if (rootDir.length > rootByteLimit) {
    const rootEntries: Entry[] = [];
    const leaves: Uint8Array[] = [];
    let leafOffset = 0;
    for (let i = 0; i < entries.length; i += leafEntries) {
      const chunk = entries.slice(i, i + leafEntries);
      const leaf = gzipSync(serializeDirectory(chunk));
      // runLength 0 marks a leaf pointer; its offset is within the leaf section
      rootEntries.push({ tileId: chunk[0].tileId, offset: leafOffset, length: leaf.length, runLength: 0 });
      leaves.push(leaf);
      leafOffset += leaf.length;
    }
    rootDir = gzipSync(serializeDirectory(rootEntries));
    leafSection = new Uint8Array(leafOffset);
    let pos = 0;
    for (const leaf of leaves) {
      leafSection.set(leaf, pos);
      pos += leaf.length;
    }
  }

  const metadata = gzipSync(
    new TextEncoder().encode(
      JSON.stringify({
        name: layerName,
        vector_layers: [{ id: layerName, fields: fieldTypes(geojson), minzoom: 0, maxzoom: maxZoom }],
      }),
    ),
  );

  const rootOffset = 127;
  const metadataOffset = rootOffset + rootDir.length;
  const leafOffset = metadataOffset + metadata.length;
  const dataOffset = leafOffset + leafSection.length;
  const [minLon, minLat, maxLon, maxLat] = bounds(geojson);

  const archive = new Uint8Array(dataOffset + tileOffset);
  const view = new DataView(archive.buffer);
  archive.set(new TextEncoder().encode('PMTiles'), 0);
  view.setUint8(7, 3);
  setUint64(view, 8, rootOffset);
  setUint64(view, 16, rootDir.length);
  setUint64(view, 24, metadataOffset);
  setUint64(view, 32, metadata.length);
  setUint64(view, 40, leafOffset);
  setUint64(view, 48, leafSection.length);
  setUint64(view, 56, dataOffset);
  setUint64(view, 64, tileOffset);
  setUint64(view, 72, entries.length);
  setUint64(view, 80, entries.length);
  setUint64(view, 88, entries.length);
  view.setUint8(96, 1); // clustered
  view.setUint8(97, GZIP);
  view.setUint8(98, GZIP);
  view.setUint8(99, MVT);
  view.setUint8(100, 0); // min zoom
  view.setUint8(101, maxZoom);
  view.setInt32(102, Math.round(minLon * 1e7), true);
  view.setInt32(106, Math.round(minLat * 1e7), true);
  view.setInt32(110, Math.round(maxLon * 1e7), true);
  view.setInt32(114, Math.round(maxLat * 1e7), true);
  view.setUint8(118, Math.ceil(maxZoom / 2));
  view.setInt32(119, Math.round(((minLon + maxLon) / 2) * 1e7), true);
  view.setInt32(123, Math.round(((minLat + maxLat) / 2) * 1e7), true);

  archive.set(rootDir, rootOffset);
  archive.set(metadata, metadataOffset);
  archive.set(leafSection, leafOffset);
  let pos = dataOffset;
  for (const tile of tiles) {
    archive.set(tile.data, pos);
    pos += tile.data.length;
  }
  return archive;
}
