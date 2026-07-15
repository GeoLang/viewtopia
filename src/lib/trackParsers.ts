/**
 * Parsers for point-track imports. Each returns [lng, lat, ele?] tuples so
 * renderers can build a polyline plus points directly.
 */

export type TrackPoint = [number, number, number?];

export interface ParsedTrack {
  name: string;
  points: TrackPoint[];
}

function parseGpx(text: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const nodes = doc.querySelectorAll('trkpt, rtept, wpt');
  const points: TrackPoint[] = [];
  nodes.forEach((n) => {
    const lat = Number(n.getAttribute('lat'));
    const lon = Number(n.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const eleText = n.querySelector('ele')?.textContent;
    const ele = eleText ? Number(eleText) : undefined;
    points.push([lon, lat, Number.isFinite(ele as number) ? ele : undefined]);
  });
  return points;
}

function parseKml(text: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const coordEls = doc.querySelectorAll('coordinates');
  const points: TrackPoint[] = [];
  coordEls.forEach((el) => {
    const raw = el.textContent?.trim() ?? '';
    for (const tuple of raw.split(/\s+/)) {
      const [lon, lat, alt] = tuple.split(',').map(Number);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      points.push([lon, lat, Number.isFinite(alt) ? alt : undefined]);
    }
  });
  return points;
}

function parseCsv(text: string): TrackPoint[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const lonIdx = header.findIndex((h) => ['lon', 'lng', 'longitude', 'x'].includes(h));
  const latIdx = header.findIndex((h) => ['lat', 'latitude', 'y'].includes(h));
  const eleIdx = header.findIndex((h) => ['ele', 'elevation', 'alt', 'altitude', 'z'].includes(h));
  if (lonIdx < 0 || latIdx < 0) return [];
  const points: TrackPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const lon = Number(cols[lonIdx]);
    const lat = Number(cols[latIdx]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const eleRaw = eleIdx >= 0 ? cols[eleIdx]?.trim() : '';
    const ele = eleRaw ? Number(eleRaw) : undefined;
    points.push([lon, lat, Number.isFinite(ele as number) ? ele : undefined]);
  }
  return points;
}

export function parseTrack(name: string, text: string): ParsedTrack {
  const ext = name.split('.').pop()?.toLowerCase();
  let points: TrackPoint[];
  if (ext === 'gpx') points = parseGpx(text);
  else if (ext === 'kml') points = parseKml(text);
  else if (ext === 'csv') points = parseCsv(text);
  else throw new Error(`unsupported track format: ${ext}`);
  return { name, points };
}
