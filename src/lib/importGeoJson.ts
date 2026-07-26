/**
 * File imports for the drag-and-drop panel: every format its UI claims parses to
 * a FeatureCollection, which the agent-layer store then draws on any renderer.
 */
import { kml, gpx } from '@tmcw/togeojson';
import { toFeatureCollection } from '../store/agentLayers';
import { csvCoordColumns } from './trackParsers';

export const IMPORT_FORMATS = ['.geojson', '.json', '.kml', '.gpx', '.csv'];

const GEOMETRY_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
];

function parseXml(text: string, kind: 'kml' | 'gpx'): GeoJSON.FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`${kind} is not valid XML`);
  const parsed = kind === 'kml' ? kml(doc) : gpx(doc);
  // KML placemarks can carry no geometry at all, and nothing can draw those
  return {
    type: 'FeatureCollection',
    features: parsed.features.filter((f): f is GeoJSON.Feature => !!f.geometry),
  };
}

/** One point feature per row, every column kept as a property. */
function parseCsv(text: string): GeoJSON.FeatureCollection {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const columns = lines[0].split(',').map((h) => h.trim());
  const { lonIdx, latIdx } = csvCoordColumns(columns.map((h) => h.toLowerCase()));
  if (lonIdx < 0 || latIdx < 0) throw new Error('CSV needs a longitude and a latitude column');

  const features: GeoJSON.Feature[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    const lon = Number(cells[lonIdx]);
    const lat = Number(cells[latIdx]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const properties: Record<string, string> = {};
    columns.forEach((column, i) => {
      if (i !== lonIdx && i !== latIdx && cells[i] !== undefined) properties[column] = cells[i];
    });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties,
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Parse an imported file by extension. Throws with a user-facing reason. */
export function parseImport(name: string, text: string): GeoJSON.FeatureCollection {
  const ext = name.split('.').pop()?.toLowerCase();
  let collection: GeoJSON.FeatureCollection | null;
  if (ext === 'geojson' || ext === 'json') {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('not valid JSON');
    }
    collection = toFeatureCollection(raw);
    // the renderers throw on an unknown geometry, so reject it here instead
    if (!collection || !collection.features.every((f) => GEOMETRY_TYPES.includes(f.geometry?.type)))
      throw new Error('not GeoJSON');
  } else if (ext === 'kml' || ext === 'gpx') {
    collection = parseXml(text, ext);
  } else if (ext === 'csv') {
    collection = parseCsv(text);
  } else {
    throw new Error(`unsupported format: .${ext}`);
  }
  if (collection.features.length === 0) throw new Error('no features found');
  return collection;
}
