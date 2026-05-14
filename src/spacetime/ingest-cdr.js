/**
 * CDR (Call Detail Record) Import — parse telecom carrier data.
 *
 * Supports common CDR formats with columns for:
 * - caller/called numbers
 * - timestamp/duration
 * - cell tower ID + sector
 * - tower lat/lng
 *
 * Creates entities for phone numbers and links for calls/messages.
 */

import { createEntity, createEvent, createTrack, createLink } from './models.js';

/**
 * @typedef {Object} CDRRecord
 * @property {string} callerNumber
 * @property {string} calledNumber
 * @property {number} timestamp
 * @property {number} durationSec
 * @property {string} type - 'call', 'sms', 'data'
 * @property {string} towerId
 * @property {number} towerLng
 * @property {number} towerLat
 * @property {string} sector
 */

/**
 * Column name mapping for common CDR formats.
 */
const CDR_COLUMN_ALIASES = {
  caller: ['caller', 'calling_number', 'a_number', 'source_number', 'from', 'originating_number', 'msisdn_a'],
  called: ['called', 'callee', 'called_number', 'b_number', 'destination_number', 'to', 'terminating_number', 'msisdn_b'],
  timestamp: ['timestamp', 'date_time', 'datetime', 'start_time', 'call_time', 'event_time', 'time'],
  duration: ['duration', 'duration_sec', 'duration_seconds', 'call_duration', 'length'],
  type: ['type', 'event_type', 'call_type', 'record_type', 'service_type'],
  towerId: ['tower_id', 'cell_id', 'site_id', 'cgi', 'lac_ci', 'cell_tower', 'base_station'],
  towerLng: ['tower_lng', 'tower_longitude', 'site_lng', 'cell_lng', 'longitude'],
  towerLat: ['tower_lat', 'tower_latitude', 'site_lat', 'cell_lat', 'latitude'],
  sector: ['sector', 'azimuth', 'cell_sector', 'antenna'],
};

/**
 * Find the matching column name from a header row.
 */
function findColumn(headers, field) {
  const aliases = CDR_COLUMN_ALIASES[field] || [];
  const normalized = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse CDR CSV data.
 *
 * @param {string} csvText
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Map<string, import('./models.js').Track>} trackMap
 * @returns {{entities: import('./models.js').Entity[], tracks: import('./models.js').Track[], links: import('./models.js').Link[], records: number}}
 */
export function ingestCDR(csvText, entities, trackMap) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CDR file must have a header row + data');

  const headers = lines[0].split(',');
  const callerCol = findColumn(headers, 'caller');
  const calledCol = findColumn(headers, 'called');
  const timestampCol = findColumn(headers, 'timestamp');
  const durationCol = findColumn(headers, 'duration');
  const typeCol = findColumn(headers, 'type');
  const towerIdCol = findColumn(headers, 'towerId');
  const towerLngCol = findColumn(headers, 'towerLng');
  const towerLatCol = findColumn(headers, 'towerLat');
  const sectorCol = findColumn(headers, 'sector');

  if (callerCol < 0) throw new Error('CDR: no caller/source number column found');
  if (timestampCol < 0) throw new Error('CDR: no timestamp column found');

  // Entity lookup by phone number
  const phoneToEntity = new Map();
  const result = { entities: [], tracks: [], links: [], records: 0 };
  const linkPairs = new Map(); // "a:b" -> link stats

  function getOrCreateEntity(phoneNumber) {
    if (phoneToEntity.has(phoneNumber)) return phoneToEntity.get(phoneNumber);

    // Check if any existing entity has this as an alias
    for (const [id, ent] of entities) {
      if (ent.aliases?.includes(phoneNumber)) {
        phoneToEntity.set(phoneNumber, ent);
        return ent;
      }
    }

    const entity = createEntity(phoneNumber, 'device');
    entity.aliases = [phoneNumber];
    entity.properties = { source: 'cdr', type: 'phone' };
    entity.notes = '';
    entity.classification = 'unclassified';
    entity.group = null;
    entities.set(entity.id, entity);
    phoneToEntity.set(phoneNumber, entity);
    result.entities.push(entity);
    return entity;
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 2) continue;

    const callerNum = cols[callerCol]?.trim();
    if (!callerNum) continue;

    const calledNum = calledCol >= 0 ? cols[calledCol]?.trim() : null;
    const timestamp = new Date(cols[timestampCol]?.trim()).getTime();
    if (isNaN(timestamp)) continue;

    const duration = durationCol >= 0 ? parseInt(cols[durationCol]) || 0 : 0;
    const type = typeCol >= 0 ? cols[typeCol]?.trim().toLowerCase() : 'call';
    const towerId = towerIdCol >= 0 ? cols[towerIdCol]?.trim() : null;
    const towerLng = towerLngCol >= 0 ? parseFloat(cols[towerLngCol]) : null;
    const towerLat = towerLatCol >= 0 ? parseFloat(cols[towerLatCol]) : null;
    const sector = sectorCol >= 0 ? cols[sectorCol]?.trim() : null;

    // Create/get entities
    const callerEntity = getOrCreateEntity(callerNum);
    if (calledNum) getOrCreateEntity(calledNum);

    // Create event at tower location (if available)
    if (towerLng != null && towerLat != null && !isNaN(towerLng) && !isNaN(towerLat)) {
      // Get or create track for caller
      let track = [...trackMap.values()].find(t => t.entityId === callerEntity.id);
      if (!track) {
        track = createTrack(callerEntity.id);
        trackMap.set(track.id, track);
        result.tracks.push(track);
      }

      track.events.push(createEvent(callerEntity.id, timestamp, towerLng, towerLat, {
        metadata: { towerId, sector, duration, type, calledNum },
      }));
    }

    // Create communication link
    if (calledNum) {
      const calledEntity = phoneToEntity.get(calledNum);
      const key = [callerEntity.id, calledEntity.id].sort().join(':');
      if (!linkPairs.has(key)) {
        linkPairs.set(key, {
          from: callerEntity.id,
          to: calledEntity.id,
          count: 0,
          firstSeen: Infinity,
          lastSeen: -Infinity,
          totalDuration: 0,
        });
      }
      const pair = linkPairs.get(key);
      pair.count++;
      if (timestamp < pair.firstSeen) pair.firstSeen = timestamp;
      if (timestamp > pair.lastSeen) pair.lastSeen = timestamp;
      pair.totalDuration += duration;
    }

    result.records++;
  }

  // Sort track events
  for (const track of result.tracks) {
    track.events.sort((a, b) => a.timestamp - b.timestamp);
    if (track.events.length > 0) {
      track.startTime = track.events[0].timestamp;
      track.endTime = track.events[track.events.length - 1].timestamp;
    }
  }

  // Create links from pair stats
  for (const pair of linkPairs.values()) {
    result.links.push(createLink(pair.from, pair.to, 'communication', {
      strength: Math.min(1.0, pair.count / 20),
      firstSeen: pair.firstSeen,
      lastSeen: pair.lastSeen,
      evidenceCount: pair.count,
      metadata: { totalDuration: pair.totalDuration },
    }));
  }

  return result;
}
