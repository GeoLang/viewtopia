/**
 * Notebook types — Jupyter-like workflow cells for ViewTopia.
 *
 * A Notebook is an ordered list of cells.
 */

/** Supported cell types */
export type CellType = 'markdown' | 'python' | 'sql';

/** Execution status of a cell */
export type CellStatus = 'idle' | 'running' | 'success' | 'error';

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
}
