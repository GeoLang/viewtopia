import maplibregl from 'maplibre-gl';
import { FileSource, PMTiles, Protocol, TileType } from 'pmtiles';

/**
 * One Protocol for the whole page: addProtocol is global, and local archives
 * registered on it must be the same instance the map resolves pmtiles:// with.
 */
const protocol = new Protocol();
let registered = false;

/** Teach MapLibre the pmtiles:// scheme. Register once per page. */
export function registerPmtilesProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('pmtiles', protocol.tile);
}

export interface PmtilesInfo {
  kind: 'vector' | 'raster';
  /** Source-layer names to draw; empty for a raster archive. */
  vectorLayers: string[];
  minZoom: number;
  maxZoom: number;
  /** Backed by a browser File: drawable this session, gone after a reload. */
  local?: boolean;
}

const RASTER_TYPES = [TileType.Png, TileType.Jpeg, TileType.Webp, TileType.Avif];

async function probe(archive: PMTiles): Promise<PmtilesInfo> {
  const header = await archive.getHeader();
  if (header.tileType === TileType.Mvt) {
    const metadata = (await archive.getMetadata()) as
      | { vector_layers?: { id: string }[] }
      | null;
    const vectorLayers = metadata?.vector_layers?.map((l) => l.id) ?? [];
    if (vectorLayers.length === 0) throw new Error('archive lists no vector layers');
    return { kind: 'vector', vectorLayers, minZoom: header.minZoom, maxZoom: header.maxZoom };
  }
  if (!RASTER_TYPES.includes(header.tileType)) {
    throw new Error('archive holds neither MVT nor raster tiles');
  }
  return { kind: 'raster', vectorLayers: [], minZoom: header.minZoom, maxZoom: header.maxZoom };
}

/** Validate a remote archive and cache it on the protocol. Throws with a reason. */
export async function addRemotePmtiles(url: string): Promise<PmtilesInfo> {
  const archive = new PMTiles(url);
  const info = await probe(archive);
  protocol.add(archive);
  return info;
}

/**
 * Register a dropped .pmtiles file. The style references it as
 * pmtiles://<file name>, which the protocol resolves to the File.
 */
export async function addLocalPmtiles(file: File): Promise<{ url: string; info: PmtilesInfo }> {
  const archive = new PMTiles(new FileSource(file));
  const info = await probe(archive);
  protocol.add(archive);
  return { url: `pmtiles://${file.name}`, info: { ...info, local: true } };
}
