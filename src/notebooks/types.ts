/**
 * Notebook types — Jupyter-like workflow cells for ViewTopia.
 *
 * A Notebook is an ordered list of cells. Each cell can be:
 * - code: JavaScript/TypeScript that runs against the ViewTopia API
 * - markdown: Documentation/notes
 * - map-action: A recorded map operation (flyTo, addLayer, measure, etc.)
 *
 * Notebooks can be replayed step-by-step to reproduce a workflow.
 */

/** Supported cell types */
export type CellType = 'code' | 'markdown' | 'map-action' | 'python' | 'sql';

/** Execution status of a cell */
export type CellStatus = 'idle' | 'running' | 'success' | 'error';

/** A map action that was recorded or can be replayed */
export interface MapAction {
  command: string;
  params: Record<string, unknown>;
  /** Human-readable description generated automatically */
  description?: string;
}

/** Output from running a cell */
export interface CellOutput {
  type: 'text' | 'json' | 'image' | 'map-state' | 'error' | 'table';
  data: unknown;
  timestamp: number;
}

/** A single cell in a notebook */
export interface NotebookCell {
  id: string;
  type: CellType;
  /** Source code, markdown text, or serialized action */
  source: string;
  /** For map-action cells, the structured action */
  action?: MapAction;
  /** Outputs from the last execution */
  outputs: CellOutput[];
  /** Execution status */
  status: CellStatus;
  /** Execution count (how many times this cell has been run) */
  executionCount: number;
  /** Whether this cell is collapsed in the UI */
  collapsed: boolean;
}

/** A complete notebook */
export interface Notebook {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  /** Tags for organizing */
  tags: string[];
  /** Kernel-like runtime state (variables persisted between cells) */
  variables?: Record<string, unknown>;
}
