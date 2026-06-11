/**
 * Notebook runtime — executes cells and manages state.
 */
import type { Notebook, NotebookCell, CellOutput, MapAction } from './types';

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
 * Execute a code cell in a sandboxed context.
 */
export async function executeCodeCell(
  cell: NotebookCell,
  runtime: NotebookRuntime
): Promise<CellOutput[]> {
  const outputs: CellOutput[] = [];

  // Override print/display to capture outputs
  const ctx: NotebookRuntime = {
    ...runtime,
    print: (...args: unknown[]) => {
      outputs.push({ type: 'text', data: args.map(String).join(' '), timestamp: Date.now() });
    },
    display: (data: unknown, type: 'text' | 'json' | 'image' = 'json') => {
      outputs.push({ type, data, timestamp: Date.now() });
    },
  };

  try {
    // Create a function from the cell source with runtime context
    const asyncFn = new Function(
      'map', 'data', 'print', 'display', 'variables',
      `"use strict"; return (async () => { ${cell.source} })();`
    );

    const result = await asyncFn(ctx.map, ctx.data, ctx.print, ctx.display, ctx.variables);

    // If the function returns a value, add it as output
    if (result !== undefined) {
      outputs.push({ type: 'json', data: result, timestamp: Date.now() });
    }
  } catch (err) {
    outputs.push({ type: 'error', data: err instanceof Error ? err.message : String(err), timestamp: Date.now() });
  }

  return outputs;
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

/**
 * Execute a map-action cell.
 */
export async function executeMapAction(
  action: MapAction,
  runtime: NotebookRuntime
): Promise<CellOutput[]> {
  const outputs: CellOutput[] = [];

  try {
    switch (action.command) {
      case 'flyTo': {
        const { lng, lat, zoom } = action.params as { lng: number; lat: number; zoom?: number };
        runtime.map.flyTo(lng, lat, zoom);
        outputs.push({ type: 'text', data: `Flew to [${lng}, ${lat}] zoom=${zoom ?? 'auto'}`, timestamp: Date.now() });
        break;
      }
      case 'addLayer': {
        const { id, geojson } = action.params as { id: string; geojson: unknown };
        runtime.map.addGeoJsonLayer(id, geojson);
        outputs.push({ type: 'text', data: `Added layer "${id}"`, timestamp: Date.now() });
        break;
      }
      case 'removeLayer': {
        const { id } = action.params as { id: string };
        runtime.map.removeLayer(id);
        outputs.push({ type: 'text', data: `Removed layer "${id}"`, timestamp: Date.now() });
        break;
      }
      case 'fitBounds': {
        const { bbox } = action.params as { bbox: [number, number, number, number] };
        runtime.map.fitBounds(bbox);
        outputs.push({ type: 'text', data: `Fit bounds [${bbox.join(', ')}]`, timestamp: Date.now() });
        break;
      }
      case 'screenshot': {
        const img = await runtime.map.screenshot();
        outputs.push({ type: 'image', data: img, timestamp: Date.now() });
        break;
      }
      case 'fetch': {
        const { url, options } = action.params as { url: string; options?: RequestInit };
        const resp = await runtime.data.fetch(url, options);
        const json = await resp.json();
        outputs.push({ type: 'json', data: json, timestamp: Date.now() });
        break;
      }
      default:
        outputs.push({ type: 'error', data: `Unknown action: ${action.command}`, timestamp: Date.now() });
    }
  } catch (err) {
    outputs.push({ type: 'error', data: err instanceof Error ? err.message : String(err), timestamp: Date.now() });
  }

  return outputs;
}

/**
 * Run all cells in a notebook sequentially (replay).
 */
export async function replayNotebook(
  notebook: Notebook,
  runtime: NotebookRuntime,
  options?: {
    /** Optional delay between cells (ms) for animated replay */
    delayMs?: number;
    /** Callback after each cell executes */
    onCellComplete?: (cellIndex: number, cell: NotebookCell) => void;
    /** Stop before this cell index */
    stopBefore?: number;
  }
): Promise<Notebook> {
  const updatedCells: NotebookCell[] = [...notebook.cells];

  for (let i = 0; i < updatedCells.length; i++) {
    if (options?.stopBefore !== undefined && i >= options.stopBefore) break;

    const cell = updatedCells[i];
    if (cell.type === 'markdown') {
      options?.onCellComplete?.(i, cell);
      continue;
    }

    // Mark running
    updatedCells[i] = { ...cell, status: 'running', outputs: [] };

    let outputs: CellOutput[];
    if (cell.type === 'map-action' && cell.action) {
      outputs = await executeMapAction(cell.action, runtime);
    } else {
      outputs = await executeCodeCell(cell, runtime);
    }

    const hasError = outputs.some((o) => o.type === 'error');
    updatedCells[i] = {
      ...cell,
      outputs,
      status: hasError ? 'error' : 'success',
      executionCount: cell.executionCount + 1,
    };

    options?.onCellComplete?.(i, updatedCells[i]);

    if (options?.delayMs && i < updatedCells.length - 1) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  return { ...notebook, cells: updatedCells, variables: runtime.variables };
}
