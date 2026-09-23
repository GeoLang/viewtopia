/**
 * Notebook runtime — executes cells and manages state.
 */
import type { NotebookCell, CellOutput } from './types';

/** Runtime context available to code cells */
export interface NotebookRuntime {
  /** Shared variables persisted between cells */
  variables: Record<string, unknown>;
  /** Map API for code cells */
  map: {
    flyTo: (lng: number, lat: number, zoom?: number) => void;
    addGeoJsonLayer: (id: string, geojson: unknown) => void;
    removeLayer: (id: string) => void;
    fitBounds: (bbox: [number, number, number, number]) => void;
    getCenter: () => { lng: number; lat: number };
    getZoom: () => number;
    screenshot: () => Promise<string>;
  };
  /** Data API */
  data: {
    fetch: (url: string, opts?: RequestInit) => Promise<Response>;
    query: (sql: string) => Promise<unknown[]>;
  };
  /** Output helpers */
  print: (...args: unknown[]) => void;
  display: (data: unknown, type?: 'text' | 'json' | 'image') => void;
}

/**
 * Execute a SQL cell against the embedded DuckDB-WASM instance.
 */
export async function executeSqlCell(cell: NotebookCell): Promise<CellOutput[]> {
  const { query } = await import('../duckdb');
  const sql = cell.source.trim();
  if (!sql) return [];
  try {
    const result = await query(sql);
    return [{
      type: 'table',
      data: { columns: result.columns, rows: result.rows, rowCount: result.rowCount },
      timestamp: Date.now(),
    }];
  } catch (err) {
    return [{ type: 'error', data: err instanceof Error ? err.message : String(err), timestamp: Date.now() }];
  }
}
