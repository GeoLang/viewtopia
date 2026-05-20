/**
 * Offline Database — IndexedDB-backed storage for all ViewTopia data.
 *
 * All reads/writes go through here. Data is always available locally,
 * regardless of network status. Changes are queued for sync.
 */

const DB_NAME = 'viewtopia-offline';
const DB_VERSION = 1;

export interface OfflineLayer {
  id: string;
  name: string;
  type: 'raster' | 'vector' | 'tiles3d' | 'terrain' | 'geojson';
  visible: boolean;
  opacity: number;
  /** GeoJSON data cached locally */
  data?: GeoJSON.FeatureCollection | null;
  /** Remote URL for tile/raster layers */
  sourceUrl?: string;
  updatedAt: number;
}

export interface OfflineFeature {
  id: string;
  layerId: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  updatedAt: number;
}

export interface OfflineAnnotation {
  id: string;
  lat: number;
  lng: number;
  text: string;
  color?: string;
  createdAt: number;
}

export interface PendingOperation {
  id: string;
  /** Timestamp when the operation was created */
  createdAt: number;
  /** Operation type */
  type: 'create' | 'update' | 'delete';
  /** Which store/resource this affects */
  resource: 'layer' | 'feature' | 'annotation' | 'bookmark' | 'session';
  /** The ID of the affected record */
  resourceId: string;
  /** The full payload to send to the server */
  payload: unknown;
  /** Number of sync attempts */
  attempts: number;
  /** Last error message if sync failed */
  lastError?: string;
}

export interface CachedResponse {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  cachedAt: number;
  /** TTL in ms — 0 means cache forever */
  ttl: number;
}

let dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Layers store
      if (!db.objectStoreNames.contains('layers')) {
        db.createObjectStore('layers', { keyPath: 'id' });
      }

      // Features store (per-layer features)
      if (!db.objectStoreNames.contains('features')) {
        const store = db.createObjectStore('features', { keyPath: 'id' });
        store.createIndex('byLayer', 'layerId', { unique: false });
      }

      // Annotations
      if (!db.objectStoreNames.contains('annotations')) {
        db.createObjectStore('annotations', { keyPath: 'id' });
      }

      // Pending operations queue (for sync)
      if (!db.objectStoreNames.contains('pendingOps')) {
        const store = db.createObjectStore('pendingOps', { keyPath: 'id' });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }

      // API response cache
      if (!db.objectStoreNames.contains('apiCache')) {
        const store = db.createObjectStore('apiCache', { keyPath: 'url' });
        store.createIndex('byCachedAt', 'cachedAt', { unique: false });
      }

      // Tile cache (map tiles for offline viewing)
      if (!db.objectStoreNames.contains('tileCache')) {
        db.createObjectStore('tileCache', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Generic CRUD helpers ────────────────────────────────────────────

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clear(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Layers ──────────────────────────────────────────────────────────

export const layers = {
  getAll: () => getAll<OfflineLayer>('layers'),
  get: (id: string) => getById<OfflineLayer>('layers', id),
  put: (layer: OfflineLayer) => put('layers', layer),
  remove: (id: string) => remove('layers', id),
  clear: () => clear('layers'),
};

// ─── Features ────────────────────────────────────────────────────────

export const features = {
  getAll: () => getAll<OfflineFeature>('features'),
  get: (id: string) => getById<OfflineFeature>('features', id),
  put: (feature: OfflineFeature) => put('features', feature),
  remove: (id: string) => remove('features', id),

  async getByLayer(layerId: string): Promise<OfflineFeature[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('features', 'readonly');
      const store = tx.objectStore('features');
      const index = store.index('byLayer');
      const req = index.getAll(layerId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
};

// ─── Annotations ─────────────────────────────────────────────────────

export const annotations = {
  getAll: () => getAll<OfflineAnnotation>('annotations'),
  get: (id: string) => getById<OfflineAnnotation>('annotations', id),
  put: (ann: OfflineAnnotation) => put('annotations', ann),
  remove: (id: string) => remove('annotations', id),
};

// ─── Pending Operations ──────────────────────────────────────────────

export const pendingOps = {
  getAll: () => getAll<PendingOperation>('pendingOps'),
  add: (op: PendingOperation) => put('pendingOps', op),
  remove: (id: string) => remove('pendingOps', id),
  clear: () => clear('pendingOps'),

  async count(): Promise<number> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingOps', 'readonly');
      const store = tx.objectStore('pendingOps');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async updateAttempts(id: string, error: string): Promise<void> {
    const op = await getById<PendingOperation>('pendingOps', id);
    if (op) {
      op.attempts += 1;
      op.lastError = error;
      await put('pendingOps', op);
    }
  },
};

// ─── API Cache ───────────────────────────────────────────────────────

export const apiCache = {
  async get(url: string): Promise<CachedResponse | undefined> {
    const entry = await getById<CachedResponse>('apiCache', url);
    if (!entry) return undefined;
    // Check TTL
    if (entry.ttl > 0 && Date.now() - entry.cachedAt > entry.ttl) {
      await remove('apiCache', url);
      return undefined;
    }
    return entry;
  },

  put: (entry: CachedResponse) => put('apiCache', entry),
  remove: (url: string) => remove('apiCache', url),
  clear: () => clear('apiCache'),

  /** Evict entries older than maxAge (ms) */
  async evictOlderThan(maxAge: number): Promise<number> {
    const all = await getAll<CachedResponse>('apiCache');
    const cutoff = Date.now() - maxAge;
    let evicted = 0;
    for (const entry of all) {
      if (entry.cachedAt < cutoff) {
        await remove('apiCache', entry.url);
        evicted++;
      }
    }
    return evicted;
  },
};

// ─── Tile Cache ──────────────────────────────────────────────────────

export interface CachedTile {
  key: string; // "{z}/{x}/{y}@{sourceId}"
  blob: ArrayBuffer;
  contentType: string;
  cachedAt: number;
}

export const tileCache = {
  async get(key: string): Promise<CachedTile | undefined> {
    return getById<CachedTile>('tileCache', key);
  },
  put: (tile: CachedTile) => put('tileCache', tile),
  clear: () => clear('tileCache'),

  /** Get total cache size in bytes */
  async size(): Promise<number> {
    const all = await getAll<CachedTile>('tileCache');
    return all.reduce((sum, t) => sum + t.blob.byteLength, 0);
  },
};
