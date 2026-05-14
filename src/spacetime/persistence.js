/**
 * IndexedDB Persistence — store large datasets client-side so they survive
 * page refreshes without re-importing.
 *
 * Uses the `idb` library for a clean Promise-based API.
 */

import { openDB } from 'idb';

const DB_NAME = 'viewtopia-spacetime';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Entities store
        if (!db.objectStoreNames.contains('entities')) {
          db.createObjectStore('entities', { keyPath: 'id' });
        }
        // Tracks store (events embedded in track)
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('entityId', 'entityId');
        }
        // Links store
        if (!db.objectStoreNames.contains('links')) {
          db.createObjectStore('links', { keyPath: 'id' });
        }
        // Metadata store (settings, last import, etc.)
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

// --- Entities ---

export async function saveEntity(entity) {
  const db = await getDB();
  await db.put('entities', entity);
}

export async function saveEntities(entities) {
  const db = await getDB();
  const tx = db.transaction('entities', 'readwrite');
  for (const entity of entities) {
    tx.store.put(entity);
  }
  await tx.done;
}

export async function loadEntities() {
  const db = await getDB();
  return db.getAll('entities');
}

export async function deleteEntityFromDB(id) {
  const db = await getDB();
  await db.delete('entities', id);
}

// --- Tracks ---

export async function saveTrack(track) {
  const db = await getDB();
  // Store track with serialized events
  await db.put('tracks', {
    id: track.id || `track-${track.entityId}`,
    entityId: track.entityId,
    events: track.events,
    startTime: track.startTime,
    endTime: track.endTime,
  });
}

export async function saveTracks(tracks) {
  const db = await getDB();
  const tx = db.transaction('tracks', 'readwrite');
  for (const track of tracks) {
    tx.store.put({
      id: track.id || `track-${track.entityId}`,
      entityId: track.entityId,
      events: track.events,
      startTime: track.startTime,
      endTime: track.endTime,
    });
  }
  await tx.done;
}

export async function loadTracks() {
  const db = await getDB();
  return db.getAll('tracks');
}

export async function deleteTrackFromDB(id) {
  const db = await getDB();
  await db.delete('tracks', id);
}

// --- Links ---

export async function saveLinks(links) {
  const db = await getDB();
  const tx = db.transaction('links', 'readwrite');
  for (const link of links) {
    tx.store.put(link);
  }
  await tx.done;
}

export async function loadLinks() {
  const db = await getDB();
  return db.getAll('links');
}

// --- Metadata ---

export async function saveMeta(key, value) {
  const db = await getDB();
  await db.put('meta', value, key);
}

export async function loadMeta(key) {
  const db = await getDB();
  return db.get('meta', key);
}

// --- Bulk operations ---

/**
 * Save entire session (entities + tracks + links).
 */
export async function saveSession(entities, tracks, links) {
  await Promise.all([
    saveEntities(entities),
    saveTracks(tracks),
    saveLinks(links),
  ]);
  await saveMeta('lastSaved', Date.now());
}

/**
 * Load entire session.
 * @returns {Promise<{entities: Array, tracks: Array, links: Array, lastSaved: number|null}>}
 */
export async function loadSession() {
  const [entities, tracks, links, lastSaved] = await Promise.all([
    loadEntities(),
    loadTracks(),
    loadLinks(),
    loadMeta('lastSaved'),
  ]);
  return { entities, tracks, links, lastSaved };
}

/**
 * Clear all stored data.
 */
export async function clearSession() {
  const db = await getDB();
  const tx1 = db.transaction('entities', 'readwrite');
  await tx1.store.clear();
  await tx1.done;
  const tx2 = db.transaction('tracks', 'readwrite');
  await tx2.store.clear();
  await tx2.done;
  const tx3 = db.transaction('links', 'readwrite');
  await tx3.store.clear();
  await tx3.done;
  await db.delete('meta', 'lastSaved');
}

/**
 * Get total event count stored.
 */
export async function getStoredEventCount() {
  const db = await getDB();
  const tracks = await db.getAll('tracks');
  return tracks.reduce((sum, t) => sum + (t.events?.length || 0), 0);
}
