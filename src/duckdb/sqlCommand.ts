/**
 * sql_query viewer command: run SQL against the shared in-browser DuckDB,
 * render any detected geometry as an agent layer (drawn by every renderer),
 * and publish a result summary for UI/agent-roundtrip code.
 *
 * Geometry detection and GeoJSON conversion live in queryAsGeoJson; a missing
 * geometry is a valid outcome (NoGeometryError), not a query failure.
 */
import { query } from './index';
import { queryAsGeoJson, NoGeometryError } from './spatial';
import { useAgentLayerStore } from '../store/agentLayers';

export interface SqlResultSummary {
  sql: string;
  rowCount: number;
  columns: string[];
  sample: Record<string, unknown>[];
}

declare global {
  interface Window {
    __viewtopiaSqlResults?: SqlResultSummary[];
  }
}

const RING_SIZE = 20;

function stashResult(summary: SqlResultSummary): void {
  const buf = window.__viewtopiaSqlResults ?? [];
  buf.push(summary);
  if (buf.length > RING_SIZE) buf.splice(0, buf.length - RING_SIZE);
  window.__viewtopiaSqlResults = buf;
}

export async function runSqlQuery(params: Record<string, unknown>): Promise<void> {
  const sql = typeof params.sql === 'string' ? params.sql : '';
  const showOnMap = params.show_on_map !== false;
  const color = typeof params.color === 'string' ? params.color : '#3388ff';
  const fit = params.fit !== false;

  if (!sql.trim()) {
    window.dispatchEvent(
      new CustomEvent('viewtopia:sql_error', { detail: { sql, error: 'sql_query: missing sql param' } }),
    );
    return;
  }

  try {
    const result = await query(sql);
    const summary: SqlResultSummary = {
      sql,
      rowCount: result.rowCount,
      columns: result.columns,
      sample: result.rows.slice(0, 5),
    };

    if (showOnMap) {
      try {
        const fc = await queryAsGeoJson(sql);
        if (fc.features.length > 0) {
          useAgentLayerStore
            .getState()
            .addLayer({ id: crypto.randomUUID(), name: 'SQL result', color, geojson: fc }, fit);
        }
      } catch (e) {
        // no geometry is a valid outcome, still report the summary below
        if (!(e instanceof NoGeometryError)) throw e;
      }
    }

    stashResult(summary);
    window.dispatchEvent(new CustomEvent('viewtopia:sql_result', { detail: summary }));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    window.dispatchEvent(new CustomEvent('viewtopia:sql_error', { detail: { sql, error } }));
  }
}
