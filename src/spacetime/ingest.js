/**
 * Space-time data ingest — parse CSV and GPX files into tracks.
 *
 * CSV format: expects columns for entity identifier, timestamp, longitude, latitude.
 * GPX format: standard GPX with <trk> elements containing <trkpt> with time.
 */

import { createEntity, createEvent, createTrack } from './models.js';

/**
 * @typedef {Object} IngestResult
 * @property {import('./models.js').Entity[]} entities
 * @property {import('./models.js').Track[]} tracks
 */

/**
 * Parse CSV text into entities and tracks.
 *
 * Auto-detects columns by name: looks for entity/name/id, time/timestamp/datetime,
 * lng/lon/longitude, lat/latitude.
 *
 * @param {string} csvText
 * @returns {IngestResult}
 */
export function ingestCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { entities: [], tracks: [] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  // Find column indices
  const entityCol = findCol(headers, ['entity', 'entity_id', 'name', 'id', 'device', 'vehicle']);
  const timeCol = findCol(headers, ['timestamp', 'time', 'datetime', 'date', 'epoch']);
  const lngCol = findCol(headers, ['lng', 'lon', 'longitude', 'x']);
  const latCol = findCol(headers, ['lat', 'latitude', 'y']);
  const altCol = findCol(headers, ['alt', 'altitude', 'elevation', 'z']);

  if (timeCol < 0 || lngCol < 0 || latCol < 0) {
    throw new Error('CSV must have timestamp, longitude, and latitude columns');
  }

  const entityMap = new Map(); // name -> Entity
  const eventsMap = new Map(); // entityId -> Event[]

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length <= Math.max(timeCol, lngCol, latCol)) continue;

    const entityName = entityCol >= 0 ? cols[entityCol].trim() : 'default';
    const lng = parseFloat(cols[lngCol]);
    const lat = parseFloat(cols[latCol]);
    const alt = altCol >= 0 ? parseFloat(cols[altCol]) : null;

    if (isNaN(lng) || isNaN(lat)) continue;

    // Parse timestamp (ISO string or Unix epoch)
    let timestamp;
    const raw = cols[timeCol].trim();
    const asNum = Number(raw);
    if (!isNaN(asNum) && raw.length > 0) {
      // Unix epoch: if < 1e12, assume seconds; otherwise ms
      timestamp = asNum < 1e12 ? asNum * 1000 : asNum;
    } else {
      timestamp = new Date(raw).getTime();
    }
    if (isNaN(timestamp)) continue;

    // Get or create entity
    if (!entityMap.has(entityName)) {
      entityMap.set(entityName, createEntity(entityName));
    }
    const entity = entityMap.get(entityName);

    const event = createEvent(entity.id, timestamp, lng, lat, {
      altitudeM: isNaN(alt) ? null : alt,
    });

    if (!eventsMap.has(entity.id)) eventsMap.set(entity.id, []);
    eventsMap.get(entity.id).push(event);
  }

  const entities = [...entityMap.values()];
  const tracks = entities.map(e => createTrack(e.id, eventsMap.get(e.id) || []));

  return { entities, tracks };
}

/**
 * Parse GPX XML text into entities and tracks.
 *
 * Each <trk> becomes an entity+track. Track name comes from <name> element.
 *
 * @param {string} gpxText
 * @returns {IngestResult}
 */
export function ingestGPX(gpxText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'text/xml');
  const trkElements = doc.querySelectorAll('trk');

  const entities = [];
  const tracks = [];

  for (const trk of trkElements) {
    const nameEl = trk.querySelector('name');
    const name = nameEl ? nameEl.textContent.trim() : `Track ${entities.length + 1}`;
    const entity = createEntity(name, 'device');
    entities.push(entity);

    const events = [];
    const trkpts = trk.querySelectorAll('trkpt');
    for (const pt of trkpts) {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lng)) continue;

      const timeEl = pt.querySelector('time');
      const timestamp = timeEl ? new Date(timeEl.textContent.trim()).getTime() : Date.now();
      if (isNaN(timestamp)) continue;

      const eleEl = pt.querySelector('ele');
      const alt = eleEl ? parseFloat(eleEl.textContent) : null;

      events.push(createEvent(entity.id, timestamp, lng, lat, {
        altitudeM: isNaN(alt) ? null : alt,
      }));
    }

    tracks.push(createTrack(entity.id, events));
  }

  return { entities, tracks };
}

/**
 * Auto-detect file type and ingest.
 * @param {string} text - File content
 * @param {string} filename - Original filename for extension detection
 * @returns {IngestResult}
 */
export function ingestFile(text, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'gpx' || text.trimStart().startsWith('<?xml')) {
    return ingestGPX(text);
  }
  if (ext === 'json' || text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    try {
      return ingestJSON(text);
    } catch {
      // Fall through to CSV if JSON parse fails
    }
  }
  return ingestCSV(text);
}

/**
 * Parse JSON array of events into entities and tracks.
 *
 * Expected format: array of objects with entity_id/entity, timestamp, lat, lng/lon.
 *
 * @param {string} jsonText
 * @returns {IngestResult}
 */
export function ingestJSON(jsonText) {
  const data = JSON.parse(jsonText);
  const records = Array.isArray(data) ? data : (data.events || data.features || []);

  const entityMap = new Map();
  const eventsMap = new Map();

  for (const rec of records) {
    const entityName = rec.entity_id || rec.entity || rec.name || rec.id || 'default';
    const lng = rec.lng ?? rec.lon ?? rec.longitude ?? rec.x;
    const lat = rec.lat ?? rec.latitude ?? rec.y;
    if (lng == null || lat == null) continue;

    let timestamp;
    const raw = rec.timestamp || rec.time || rec.datetime || rec.date;
    if (raw == null) continue;
    if (typeof raw === 'number') {
      timestamp = raw < 1e12 ? raw * 1000 : raw;
    } else {
      timestamp = new Date(raw).getTime();
    }
    if (isNaN(timestamp)) continue;

    if (!entityMap.has(entityName)) {
      entityMap.set(entityName, createEntity(String(entityName)));
    }
    const entity = entityMap.get(entityName);

    const event = createEvent(entity.id, timestamp, lng, lat, {
      altitudeM: rec.altitude ?? rec.alt ?? rec.elevation ?? null,
      metadata: rec.metadata ?? {},
    });

    if (!eventsMap.has(entity.id)) eventsMap.set(entity.id, []);
    eventsMap.get(entity.id).push(event);
  }

  const entities = [...entityMap.values()];
  const tracks = entities.map(e => createTrack(e.id, eventsMap.get(e.id) || []));
  return { entities, tracks };
}

// --- Helpers ---

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
