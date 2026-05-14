/**
 * KML and Shapefile ingest — additional import formats for GeoTime-style
 * multi-source data aggregation.
 */

import { createEvent, createTrack, createEntity } from './models.js';

/**
 * Parse KML document and extract placemarks as events/tracks.
 *
 * @param {string} kmlText - Raw KML XML string
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Map<string, import('./models.js').Track>} tracks
 * @returns {{entities: import('./models.js').Entity[], tracks: import('./models.js').Track[]}}
 */
export function ingestKML(kmlText, entities, tracks) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  const placemarks = doc.querySelectorAll('Placemark');
  const result = { entities: [], tracks: [] };

  for (const pm of placemarks) {
    const name = pm.querySelector('name')?.textContent?.trim() || 'KML Entity';
    const description = pm.querySelector('description')?.textContent?.trim() || '';

    // Check for LineString (track)
    const lineString = pm.querySelector('LineString coordinates');
    if (lineString) {
      const entity = createEntity(name, 'custom');
      entity.aliases = [];
      entity.properties = { source: 'kml', description };
      entity.notes = description;
      entity.classification = 'unclassified';
      entity.group = null;
      entities.set(entity.id, entity);
      result.entities.push(entity);

      const track = createTrack(entity.id);
      const coords = parseKMLCoords(lineString.textContent);
      const timestamps = getKMLTimestamps(pm);

      for (let i = 0; i < coords.length; i++) {
        const [lng, lat, alt] = coords[i];
        const ts = timestamps[i] || (Date.now() - (coords.length - i) * 60000);
        track.events.push(createEvent(entity.id, ts, lng, lat, { altitudeM: alt }));
      }

      tracks.set(track.id, track);
      result.tracks.push(track);
      continue;
    }

    // Check for Point
    const point = pm.querySelector('Point coordinates');
    if (point) {
      const [lng, lat, alt] = parseKMLCoords(point.textContent)[0] || [0, 0, 0];
      const timestamp = getKMLTimestamp(pm);

      // Find or create entity
      let entity = [...entities.values()].find(e => e.name === name);
      if (!entity) {
        entity = createEntity(name, 'location');
        entity.aliases = [];
        entity.properties = { source: 'kml', description };
        entity.notes = description;
        entity.classification = 'unclassified';
        entity.group = null;
        entities.set(entity.id, entity);
        result.entities.push(entity);
      }

      // Find or create track
      let track = [...tracks.values()].find(t => t.entityId === entity.id);
      if (!track) {
        track = createTrack(entity.id);
        tracks.set(track.id, track);
        result.tracks.push(track);
      }
      track.events.push(createEvent(entity.id, timestamp, lng, lat, { altitudeM: alt }));
    }
  }

  return result;
}

/**
 * Parse KML coordinate string "lng,lat,alt lng,lat,alt ..."
 */
function parseKMLCoords(text) {
  return text.trim().split(/\s+/).map(triple => {
    const [lng, lat, alt] = triple.split(',').map(Number);
    return [lng || 0, lat || 0, alt || 0];
  }).filter(c => c[0] !== 0 || c[1] !== 0);
}

/**
 * Extract timestamps from KML Track/gx:Track or TimeStamp elements.
 */
function getKMLTimestamps(placemark) {
  // gx:Track when elements
  const whens = placemark.querySelectorAll('when');
  if (whens.length > 0) {
    return [...whens].map(w => new Date(w.textContent.trim()).getTime());
  }
  return [];
}

function getKMLTimestamp(placemark) {
  const ts = placemark.querySelector('TimeStamp when');
  if (ts) return new Date(ts.textContent.trim()).getTime();
  const span = placemark.querySelector('TimeSpan begin');
  if (span) return new Date(span.textContent.trim()).getTime();
  return Date.now();
}

/**
 * Parse GeoJSON FeatureCollection into events/tracks.
 * GeoJSON is the closest browser-parseable equivalent to Shapefiles.
 * (Shapefiles require shp.js or similar library; users can convert to GeoJSON.)
 *
 * @param {Object} geojson - Parsed GeoJSON object
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {Map<string, import('./models.js').Track>} tracks
 * @returns {{entities: import('./models.js').Entity[], tracks: import('./models.js').Track[]}}
 */
export function ingestGeoJSON(geojson, entities, tracks) {
  const result = { entities: [], tracks: [] };
  if (!geojson.features) return result;

  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const name = props.name || props.NAME || props.id || `Feature ${result.entities.length + 1}`;
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      const ts = parseTimeProp(props);

      let entity = [...entities.values()].find(e => e.name === name);
      if (!entity) {
        entity = createEntity(name, 'location');
        entity.aliases = [];
        entity.properties = { ...props, source: 'geojson' };
        entity.notes = '';
        entity.classification = 'unclassified';
        entity.group = null;
        entities.set(entity.id, entity);
        result.entities.push(entity);
      }

      let track = [...tracks.values()].find(t => t.entityId === entity.id);
      if (!track) {
        track = createTrack(entity.id);
        tracks.set(track.id, track);
        result.tracks.push(track);
      }
      track.events.push(createEvent(entity.id, ts, lng, lat));

    } else if (geom.type === 'LineString') {
      const entity = createEntity(name, 'custom');
      entity.aliases = [];
      entity.properties = { ...props, source: 'geojson' };
      entity.notes = '';
      entity.classification = 'unclassified';
      entity.group = null;
      entities.set(entity.id, entity);
      result.entities.push(entity);

      const track = createTrack(entity.id);
      const baseTime = parseTimeProp(props);
      for (let i = 0; i < geom.coordinates.length; i++) {
        const [lng, lat] = geom.coordinates[i];
        track.events.push(createEvent(entity.id, baseTime + i * 60000, lng, lat));
      }
      tracks.set(track.id, track);
      result.tracks.push(track);

    } else if (geom.type === 'MultiPoint') {
      const entity = createEntity(name, 'custom');
      entity.aliases = [];
      entity.properties = { ...props, source: 'geojson' };
      entity.notes = '';
      entity.classification = 'unclassified';
      entity.group = null;
      entities.set(entity.id, entity);
      result.entities.push(entity);

      const track = createTrack(entity.id);
      const baseTime = parseTimeProp(props);
      for (let i = 0; i < geom.coordinates.length; i++) {
        const [lng, lat] = geom.coordinates[i];
        track.events.push(createEvent(entity.id, baseTime + i * 60000, lng, lat));
      }
      tracks.set(track.id, track);
      result.tracks.push(track);
    }
  }

  return result;
}

/**
 * Try to extract a timestamp from feature properties.
 */
function parseTimeProp(props) {
  for (const key of ['timestamp', 'time', 'date', 'datetime', 'when', 'Date', 'Time']) {
    if (props[key]) {
      const t = new Date(props[key]).getTime();
      if (!isNaN(t)) return t;
    }
  }
  return Date.now();
}
