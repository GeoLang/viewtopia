# DuckDB-WASM in ViewTopia

ViewTopia runs DuckDB with the spatial extension in a Web Worker. Notebook SQL
cells, the SQL workspace tab, file import, format conversion and the agent's
`sql_query` command all share the one database.

## Where it is used

- **Notebook SQL cells** (`'sql'` in `CellType`, run by `executeSqlCell` in
  [runtime.ts](../src/notebooks/runtime.ts)). A result with geometry gets a
  Show on map button.
- **SQL workspace**, the SQL tab of the Data Sources panel
  ([SqlWorkspaceTab.tsx](../src/features/dataSources/SqlWorkspaceTab.tsx)).
  It attaches a `.parquet` or `.csv` URL as a view, draws a result on the map,
  and exports a result as CSV or GeoParquet.
- **File import** ([importVector.ts](../src/duckdb/importVector.ts)). A dropped
  GeoPackage, Shapefile (loose or zipped), FlatGeobuf or GeoParquet file is
  read through `ST_Read` from an in-memory buffer and kept as a table, so SQL
  can query it after it is drawn.
- **Convert** writes GeoParquet through `COPY ... (FORMAT PARQUET)`.
- **Agent**: the `sql_query` viewer command, and the `sql.attach_url` action.

## Modules

```
src/duckdb/
  index.ts          query(sql), queryRows(sql), exec(sql), close(), re-exports getDb and getConnection
  worker.ts         the AsyncDuckDB singleton, bundle selection, spatial extension loading
  spatial.ts        queryAsGeoJson(sql)
  loaders.ts        attachParquetUrl, attachCsvUrl, registerGeoJson
  importVector.ts   binary vector file import
  exportFile.ts     exportQuery(sql, 'csv' | 'parquet')
  sqlCommand.ts     the sql_query viewer command
```

- One `AsyncDuckDB` and one shared connection, created on first use.
- The `eh` and `mvp` bundles are served from the app origin, not a CDN.
  `duckdb.selectBundle` picks between them.
- The spatial extension is vendored. `scripts/fetch-duckdb-extensions.mjs`
  (the `prebuild` hook, also `pnpm run fetch:duckdb-extensions`) downloads it
  for the DuckDB version compiled into the wasm binary into
  `public/duckdb-extensions/`. The worker installs it from the app origin and
  falls back to extensions.duckdb.org when the vendored copy is missing. If
  both fail, SQL without spatial functions still works.

`queryAsGeoJson` finds the geometry in a result by, in order: a DuckDB
`GEOMETRY` column, a text column named `geom`, `geometry`, `the_geom`, `wkt` or
`shape` holding WKT, or a `lon`/`lng`/`long`/`longitude`/`x` and
`lat`/`latitude`/`y` column pair.

## The `sql_query` viewer command

The agent sends it as an AG-UI custom event named `viewer_cmd`:

```json
{
  "action": "sql_query",
  "params": {
    "sql": "SELECT name, ST_Point(lon, lat) AS geom FROM parcels WHERE acres > 10",
    "show_on_map": true,
    "color": "#ff8800",
    "fit": true
  }
}
```

The viewer:

- runs the SQL against the in-browser DuckDB
- when `show_on_map` is not `false`, converts the result with `queryAsGeoJson`
  and adds it as an agent layer, which Cesium, MapLibre and Leaflet all draw,
  framing it unless `fit` is `false`
- keeps a summary (`sql`, `rowCount`, `columns`, the first 5 rows as `sample`)
  in `window.__viewtopiaSqlResults`, a ring buffer of 20
- dispatches `viewtopia:sql_result` or `viewtopia:sql_error` on `window`

## Not implemented

- Returning SQL result rows to the agent for follow-up reasoning. The summary
  goes to a window event and the ring buffer, both read by the UI, never sent
  back to the model as a turn.
- Attaching a map layer that did not come from a DuckDB import. `registerGeoJson`
  exists in `loaders.ts` but nothing calls it.
- PMTiles in SQL, an OPFS-persistent catalog, and write-back to Ptolemy.

## Bundle size

DuckDB-WASM is several MB. The worker only starts on the first query, and the
service worker leaves the DuckDB workers out of its precache.
