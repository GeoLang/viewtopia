import { unzipSync } from 'fflate';
import { kml, gpx } from '@tmcw/togeojson';

function xmlFromBytes(bytes: Uint8Array): Document {
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/xml');
}

function kmlBytesFromKmz(entries: Record<string, Uint8Array>): Uint8Array | undefined {
  if (entries['doc.kml']) return entries['doc.kml'];
  const found = Object.entries(entries).find(([path]) => {
    if (!path.toLowerCase().endsWith('.kml')) return false;
    return !path.split('/').some((part) => part === '__MACOSX' || part.startsWith('.'));
  });
  return found?.[1];
}

export function geojsonFromKmlKmzGpx(filename: string, bytes: Uint8Array): GeoJSON.FeatureCollection {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.kmz')) {
    const kmlBytes = kmlBytesFromKmz(unzipSync(bytes));
    if (!kmlBytes) {
      throw new Error('KMZ has no KML file');
    }
    return kml(xmlFromBytes(kmlBytes)) as GeoJSON.FeatureCollection;
  }
  if (lower.endsWith('.gpx')) {
    return gpx(xmlFromBytes(bytes)) as GeoJSON.FeatureCollection;
  }
  return kml(xmlFromBytes(bytes)) as GeoJSON.FeatureCollection;
}
