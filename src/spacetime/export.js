/**
 * Data Export — KML, CSV, and video capture of animations.
 */

/**
 * Export entities and tracks to KML format.
 *
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {import('./models.js').Track[]} tracks
 * @returns {string} KML document string
 */
export function exportKML(entities, tracks) {
  const placemarks = [];

  for (const track of tracks) {
    const entity = entities.get(track.entityId);
    const name = entity?.name || track.entityId;
    const color = entity?.color || '#ffffff';

    if (track.events.length === 0) continue;

    if (track.events.length === 1) {
      // Single point
      const e = track.events[0];
      placemarks.push(`
    <Placemark>
      <name>${escXml(name)}</name>
      <TimeStamp><when>${new Date(e.timestamp).toISOString()}</when></TimeStamp>
      <Point><coordinates>${e.lng},${e.lat},${e.altitudeM || 0}</coordinates></Point>
    </Placemark>`);
    } else {
      // Track as LineString with timestamps
      const coords = track.events.map(e => `${e.lng},${e.lat},${e.altitudeM || 0}`).join('\n          ');
      const whens = track.events.map(e => `<when>${new Date(e.timestamp).toISOString()}</when>`).join('\n        ');

      placemarks.push(`
    <Placemark>
      <name>${escXml(name)}</name>
      <Style><LineStyle><color>${hexToKmlColor(color)}</color><width>2</width></LineStyle></Style>
      <gx:Track>
        ${whens}
        ${track.events.map(e => `<gx:coord>${e.lng} ${e.lat} ${e.altitudeM || 0}</gx:coord>`).join('\n        ')}
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
 *
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {import('./models.js').Track[]} tracks
 * @returns {string} CSV string
 */
export function exportCSV(entities, tracks) {
  const rows = ['entity_name,entity_kind,timestamp,longitude,latitude,altitude'];

  for (const track of tracks) {
    const entity = entities.get(track.entityId);
    const name = entity?.name || track.entityId;
    const kind = entity?.kind || 'custom';

    for (const e of track.events) {
      rows.push(`"${name}","${kind}",${new Date(e.timestamp).toISOString()},${e.lng},${e.lat},${e.altitudeM || 0}`);
    }
  }

  return rows.join('\n');
}

/**
 * Export links to CSV.
 */
export function exportLinksCSV(links, entities) {
  const rows = ['source_name,target_name,link_type,strength,evidence_count,first_seen,last_seen'];
  for (const link of links) {
    const src = entities.get(link.sourceId);
    const tgt = entities.get(link.targetId);
    rows.push(`"${src?.name || link.sourceId}","${tgt?.name || link.targetId}","${link.kind}",${link.strength},${link.evidenceCount},${new Date(link.firstSeen).toISOString()},${new Date(link.lastSeen).toISOString()}`);
  }
  return rows.join('\n');
}

/**
 * Trigger a browser download of text content.
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Capture video of the current canvas animation.
 * Uses MediaRecorder API on a canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} durationMs
 * @returns {Promise<Blob>} WebM video blob
 */
export function captureVideo(canvas, durationMs = 10000) {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = reject;

    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  });
}

// Helpers

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hexToKmlColor(hex) {
  // KML uses AABBGGRR
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `ff${b}${g}${r}`;
}
