/**
 * The slice of IndexedDB the plugin store uses, backed by a Map. jsdom ships no
 * IndexedDB and the project has no fake, so this covers open/upgrade,
 * put/get/getAll/delete and transaction completion, and nothing else.
 *
 * Records are copied in and out the way IndexedDB copies them, so a test never
 * mutates a stored value by holding onto the object it wrote.
 */

type Handler = ((event: unknown) => void) | null;

/**
 * Copies bytes into the ambient Uint8Array. jsdom's TextEncoder returns one
 * from node's realm, which fails `instanceof Uint8Array` against jsdom's, and
 * a browser's IndexedDB hands back a same-realm value.
 */
function cloneRecord(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer,
    );
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      cloneRecord(entry),
    ]),
  );
}

class MemoryRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;

  settle(run: () => T, upgrade?: () => void): void {
    queueMicrotask(() => {
      try {
        upgrade?.();
        this.result = run();
        this.onsuccess?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      }
    });
  }
}

class MemoryObjectStore {
  constructor(
    readonly keyPath: string,
    private readonly rows: Map<string, unknown>,
    private readonly transaction: MemoryTransaction,
  ) {}

  put(value: Record<string, unknown>): MemoryRequest<string> {
    const key = String(value[this.keyPath]);
    const request = new MemoryRequest<string>();
    this.transaction.enqueue(() => {
      this.rows.set(key, cloneRecord(value));
      request.result = key;
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  delete(key: string): MemoryRequest<undefined> {
    const request = new MemoryRequest<undefined>();
    this.transaction.enqueue(() => {
      this.rows.delete(key);
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  get(key: string): MemoryRequest<unknown> {
    const request = new MemoryRequest<unknown>();
    this.transaction.enqueue(() => {
      request.result = cloneRecord(this.rows.get(key));
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  getAll(): MemoryRequest<unknown[]> {
    const request = new MemoryRequest<unknown[]>();
    this.transaction.enqueue(() => {
      request.result = Array.from(this.rows.values(), (row) => cloneRecord(row));
      request.onsuccess?.({ target: request });
    });
    return request;
  }
}

class MemoryTransaction {
  error: unknown = null;
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  private operations: (() => void)[] = [];
  private scheduled = false;

  constructor(private readonly database: MemoryDatabase) {}

  enqueue(operation: () => void): void {
    this.operations.push(operation);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  objectStore(name: string): MemoryObjectStore {
    const store = this.database.stores.get(name);
    if (!store) throw new Error(`no object store named ${name}`);
    return new MemoryObjectStore(store.keyPath, store.rows, this);
  }

  private flush(): void {
    try {
      for (const operation of this.operations.splice(0)) operation();
      this.oncomplete?.({ target: this });
    } catch (error) {
      this.error = error;
      this.onerror?.({ target: this });
    }
  }
}

interface StoreState {
  keyPath: string;
  rows: Map<string, unknown>;
}

class MemoryDatabase {
  readonly stores = new Map<string, StoreState>();
  version = 0;

  get objectStoreNames() {
    return { contains: (name: string) => this.stores.has(name) };
  }

  createObjectStore(name: string, options: { keyPath: string }): MemoryObjectStore {
    const state: StoreState = { keyPath: options.keyPath, rows: new Map() };
    this.stores.set(name, state);
    return new MemoryObjectStore(state.keyPath, state.rows, new MemoryTransaction(this));
  }

  transaction(_names: string | string[], _mode?: string): MemoryTransaction {
    return new MemoryTransaction(this);
  }

  close(): void {}
}

class MemoryIndexedDb {
  private readonly databases = new Map<string, MemoryDatabase>();

  open(name: string, version: number): MemoryRequest<MemoryDatabase> {
    const request = new MemoryRequest<MemoryDatabase>();
    let database = this.databases.get(name);
    const needsUpgrade = !database || database.version < version;
    if (!database) {
      database = new MemoryDatabase();
      this.databases.set(name, database);
    }
    const target = database;
    request.result = target;
    request.settle(
      () => target,
      () => {
        if (!needsUpgrade) return;
        target.version = version;
        request.onupgradeneeded?.({ target: request });
      },
    );
    return request;
  }

  deleteDatabase(name: string): void {
    this.databases.delete(name);
  }
}

/** Install the shim on globalThis and return a reset for afterEach. */
export function installMemoryIndexedDb(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new MemoryIndexedDb(),
    configurable: true,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else delete (globalThis as { indexedDB?: unknown }).indexedDB;
  };
}
