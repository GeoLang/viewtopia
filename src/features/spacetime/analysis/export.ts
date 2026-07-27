import type { Track, Entity, } from '../types';

/**
 * Export entities and tracks to KML format.
 */
export function exportKML(entities: Map<string, Entity>, tracks: Track[]): string {
  const placemarks: string[] = [];

  for (const track of tracks) {
    const entity = entities.get(track.entityId);
    const name = entity?.name ?? track.entityId;
    const color = entity?.color ?? '#ffffff';

    if (track.events.length === 0) continue;

    if (track.events.length === 1) {
      const e = track.events[0];
      placemarks.push(`
    <Placemark>
      <name>${escXml(name)}</name>
      <TimeStamp><when>${new Date(e.timestamp).toISOString()}</when></TimeStamp>
      <Point><coordinates>${e.lng},${e.lat},${e.altitude ?? 0}</coordinates></Point>
    </Placemark>`);
    } else {
      const whens = track.events
        .map((e) => `<when>${new Date(e.timestamp).toISOString()}</when>`)
        .join('\n        ');
      const coords = track.events
        .map((e) => `<gx:coord>${e.lng} ${e.lat} ${e.altitude ?? 0}</gx:coord>`)
        .join('\n        ');

      placemarks.push(`
    <Placemark>
      <name>${escXml(name)}</name>
      <Style><LineStyle><color>${hexToKmlColor(color)}</color><width>2</width></LineStyle></Style>
      <gx:Track>
        ${whens}
        ${coords}
      </gx:Track>
    </Placemark>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>ViewTopia Export</name>
    <description>Exported from ViewTopia Space-Time Analysis</description>
    ${placemarks.join('')}
  </Document>
</kml>`;
}

/**
 * Export entities and tracks to CSV.
 */
export function exportCSV(entities: Map<string, Entity>, tracks: Track[]): string {
  const rows = ['entity_name,entity_kind,timestamp,longitude,latitude,altitude'];

  for (const track of tracks) {
    const entity = entities.get(track.entityId);
    const name = entity?.name ?? track.entityId;
    const kind = entity?.kind ?? 'person';

    for (const e of track.events) {
      rows.push(
        `"${name}","${kind}",${new Date(e.timestamp).toISOString()},${e.lng},${e.lat},${e.altitude ?? 0}`,
      );
    }
  }

  return rows.join('\n');
}

/**
 * Trigger browser download of a text file.
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hexToKmlColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `ff${b}${g}${r}`;
}
