/**
 * IndexedDB store for installed runtime plugins. Separate from the offline
 * sync database so plugin code never rides along with user data.
 */

const DB_NAME = 'viewtopia-plugins';
const DB_VERSION = 1;
const STORE_NAME = 'installed';

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  /** where the bundle came from, kept so an update can be recognised */
  url: string;
  /** `sha256-<base64>` the bytes were checked against at install time */
  integrity: string;
  /** the exact bundle bytes, re-hashed against `integrity` before every load */
  code: Uint8Array;
  installedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requireIndexedDb(): void {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable, so plugins cannot be installed here');
  }
}

/** Installed plugins, or an empty list where IndexedDB does not exist. */
export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  try {
    return await new Promise<InstalledPlugin[]>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as InstalledPlugin[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function putInstalledPlugin(plugin: InstalledPlugin): Promise<void> {
  requireIndexedDb();
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(plugin);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteInstalledPlugin(id: string): Promise<void> {
  requireIndexedDb();
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
