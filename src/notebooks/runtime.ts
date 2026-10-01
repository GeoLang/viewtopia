/**
 * Notebook runtime — executes cells and manages state.
 */
import type { NotebookCell, CellOutput } from './types';

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
