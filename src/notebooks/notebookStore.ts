/**
 * Notebook store — CRUD for notebooks, active notebook, cell execution.
 */
import { create } from 'zustand';
import type { Notebook, NotebookCell, CellOutput, CellType, MapAction } from './types';
import { executeCodeCell, executeMapAction, type NotebookRuntime } from './runtime';

// IndexedDB storage for notebooks
const DB_NAME = 'viewtopia-notebooks';
const STORE_NAME = 'notebooks';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byProject', 'projectId', { unique: false });
      }
    };
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}

async function loadAll(): Promise<Notebook[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveNotebook(notebook: Notebook): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(notebook);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteNotebook(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface NotebookStoreState {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  loading: boolean;
  runtime: NotebookRuntime | null;
}

export interface NotebookStoreActions {
  load: () => Promise<void>;
  setRuntime: (runtime: NotebookRuntime) => void;
  setActive: (id: string | null) => void;
  getActive: () => Notebook | null;

  /** Create a new empty notebook */
  create: (name: string, projectId?: string) => Promise<Notebook>;
  /** Delete a notebook */
  remove: (id: string) => Promise<void>;
  /** Rename a notebook */
  rename: (id: string, name: string) => Promise<void>;

  /** Add a cell */
  addCell: (notebookId: string, type: CellType, index?: number) => Promise<void>;
  /** Update cell source */
  updateCellSource: (notebookId: string, cellId: string, source: string) => Promise<void>;
  /** Remove a cell */
  removeCell: (notebookId: string, cellId: string) => Promise<void>;
  /** Move a cell */
  moveCell: (notebookId: string, cellId: string, direction: 'up' | 'down') => Promise<void>;
  /** Toggle cell collapsed */
  toggleCellCollapse: (notebookId: string, cellId: string) => Promise<void>;

  /** Execute a single cell */
  runCell: (notebookId: string, cellId: string) => Promise<void>;
  /** Run all cells from the beginning */
  runAll: (notebookId: string) => Promise<void>;
  /** Run all cells up to (and including) a specific cell */
  runUpTo: (notebookId: string, cellId: string) => Promise<void>;

  /** Record a map action as a new cell */
  recordAction: (notebookId: string, action: MapAction) => Promise<void>;

  /** Clear all outputs */
  clearOutputs: (notebookId: string) => Promise<void>;
}

export const useNotebookStore = create<NotebookStoreState & NotebookStoreActions>((set, get) => ({
  notebooks: [],
  activeNotebookId: null,
  loading: false,
  runtime: null,

  async load() {
    set({ loading: true });
    const notebooks = await loadAll();
    set({ notebooks, loading: false });
  },

  setRuntime(runtime: NotebookRuntime) {
    set({ runtime });
  },

  setActive(id: string | null) {
    set({ activeNotebookId: id });
  },

  getActive() {
    const { notebooks, activeNotebookId } = get();
    return notebooks.find((n) => n.id === activeNotebookId) ?? null;
  },

  async create(name, projectId) {
    const now = Date.now();
    const notebook: Notebook = {
      id: crypto.randomUUID(),
      projectId,
      name,
      cells: [
        { id: crypto.randomUUID(), type: 'markdown', source: `# ${name}\n\nDescribe your workflow here.`, outputs: [], status: 'idle', executionCount: 0, collapsed: false },
        { id: crypto.randomUUID(), type: 'code', source: '// Your code here\nprint("Hello, ViewTopia!");', outputs: [], status: 'idle', executionCount: 0, collapsed: false },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: 'local-user',
      tags: [],
    };
    await saveNotebook(notebook);
    set((s) => ({ notebooks: [...s.notebooks, notebook] }));
    return notebook;
  },

  async remove(id) {
    await deleteNotebook(id);
    set((s) => ({
      notebooks: s.notebooks.filter((n) => n.id !== id),
      activeNotebookId: s.activeNotebookId === id ? null : s.activeNotebookId,
    }));
  },

  async rename(id, name) {
    const nb = get().notebooks.find((n) => n.id === id);
    if (!nb) return;
    const updated = { ...nb, name, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === id ? updated : n)) }));
  },

  async addCell(notebookId, type, index) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cell: NotebookCell = {
      id: crypto.randomUUID(),
      type,
      source: type === 'markdown' ? '' : type === 'code' ? '' : '',
      outputs: [],
      status: 'idle',
      executionCount: 0,
      collapsed: false,
    };
    const cells = [...nb.cells];
    const insertAt = index ?? cells.length;
    cells.splice(insertAt, 0, cell);
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async updateCellSource(notebookId, cellId, source) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cells = nb.cells.map((c) => (c.id === cellId ? { ...c, source } : c));
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async removeCell(notebookId, cellId) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cells = nb.cells.filter((c) => c.id !== cellId);
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async moveCell(notebookId, cellId, direction) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= nb.cells.length) return;
    const cells = [...nb.cells];
    [cells[idx], cells[newIdx]] = [cells[newIdx], cells[idx]];
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async toggleCellCollapse(notebookId, cellId) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cells = nb.cells.map((c) => (c.id === cellId ? { ...c, collapsed: !c.collapsed } : c));
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async runCell(notebookId, cellId) {
    const { runtime } = get();
    if (!runtime) return;
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cellIdx = nb.cells.findIndex((c) => c.id === cellId);
    if (cellIdx < 0) return;
    const cell = nb.cells[cellIdx];
    if (cell.type === 'markdown') return;

    // Mark running
    const runningCells = nb.cells.map((c) => (c.id === cellId ? { ...c, status: 'running' as const, outputs: [] } : c));
    const runningNb = { ...nb, cells: runningCells };
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? runningNb : n)) }));

    let outputs: CellOutput[];
    if (cell.type === 'map-action' && cell.action) {
      outputs = await executeMapAction(cell.action, runtime);
    } else {
      outputs = await executeCodeCell(cell, runtime);
    }

    const hasError = outputs.some((o) => o.type === 'error');
    const finalStatus = hasError ? 'error' : 'success';
    const doneCells = runningCells.map((c) =>
      c.id === cellId ? { ...c, outputs, status: finalStatus as 'error' | 'success', executionCount: c.executionCount + 1 } : c
    );
    const doneNb = { ...nb, cells: doneCells, updatedAt: Date.now() };
    await saveNotebook(doneNb);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? doneNb : n)) }));
  },

  async runAll(notebookId) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells) {
      if (cell.type !== 'markdown') {
        await get().runCell(notebookId, cell.id);
      }
    }
  },

  async runUpTo(notebookId, cellId) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells) {
      if (cell.type !== 'markdown') {
        await get().runCell(notebookId, cell.id);
      }
      if (cell.id === cellId) break;
    }
  },

  async recordAction(notebookId, action) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cell: NotebookCell = {
      id: crypto.randomUUID(),
      type: 'map-action',
      source: `${action.command}(${JSON.stringify(action.params)})`,
      action,
      outputs: [],
      status: 'idle',
      executionCount: 0,
      collapsed: false,
    };
    const cells = [...nb.cells, cell];
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },

  async clearOutputs(notebookId) {
    const nb = get().notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    const cells = nb.cells.map((c) => ({ ...c, outputs: [], status: 'idle' as const, executionCount: 0 }));
    const updated = { ...nb, cells, updatedAt: Date.now() };
    await saveNotebook(updated);
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === notebookId ? updated : n)) }));
  },
}));
