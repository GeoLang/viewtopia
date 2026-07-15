import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { query } from './index';
import { getConnection } from './worker';

interface GeomColumn {
  name: string;
  kind: 'geometry' | 'wkt-string';
}

/** Thrown by queryAsGeoJson when no geometry column or lon/lat pair is found. */
export class NoGeometryError extends Error {}

async function detectGeomColumn(sql: string): Promise<GeomColumn | null> {
  const conn = await getConnection();
  const probe = await conn.query(`SELECT * FROM (${sql}) LIMIT 0;`);
  const fields = probe.schema.fields.map((f) => ({ name: f.name, type: f.type.toString().toLowerCase() }));

  for (const f of fields) {
    if (f.type.includes('geometry')) return { name: f.name, kind: 'geometry' };
  }
  for (const f of fields) {
    if (/^(geom|geometry|the_geom|wkt|shape)$/i.test(f.name) && f.type.includes('varchar')) {
      return { name: f.name, kind: 'wkt-string' };
    }
  }
  return null;
}

async function detectLonLat(sql: string): Promise<{ lon: string; lat: string } | null> {
  const conn = await getConnection();
  const probe = await conn.query(`SELECT * FROM (${sql}) LIMIT 0;`);
  const names = probe.schema.fields.map((f) => f.name);
  const lon = names.find((n) => /^(lon|lng|long|longitude|x)$/i.test(n));
  const lat = names.find((n) => /^(lat|latitude|y)$/i.test(n));
  if (lon && lat) return { lon, lat };
  return null;
}

function quote(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/** Run a SQL query and return its result as a GeoJSON FeatureCollection.
 *  Detects geometry via:
 *   1. DuckDB GEOMETRY-typed column
 *   2. column named geom/geometry/the_geom/wkt/shape containing WKT
 *   3. lon/lat (or lng/lat, x/y) numeric column pair
 */
export async function queryAsGeoJson(sql: string): Promise<FeatureCollection> {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const geom = await detectGeomColumn(trimmed);

  let wrapped: string;
  if (geom?.kind === 'geometry') {
    const q = quote(geom.name);
    wrapped = `SELECT * EXCLUDE (${q}), ST_AsGeoJSON(${q}) AS __geom__ FROM (${trimmed}) _q`;
  } else if (geom?.kind === 'wkt-string') {
    const q = quote(geom.name);
    wrapped = `SELECT * EXCLUDE (${q}), ST_AsGeoJSON(ST_GeomFromText(${q})) AS __geom__ FROM (${trimmed}) _q`;
  } else {
    const lonlat = await detectLonLat(trimmed);
    if (!lonlat) {
      throw new NoGeometryError(
        'No geometry detected. Expected a GEOMETRY column, a WKT column (geom/geometry/wkt/shape), or a lon/lat column pair.',
      );
    }
    const ql = quote(lonlat.lon);
    const qa = quote(lonlat.lat);
    wrapped = `SELECT *, ST_AsGeoJSON(ST_Point(${ql}, ${qa})) AS __geom__ FROM (${trimmed}) _q`;
  }

  const result = await query(wrapped);
  const features: Feature[] = [];
  for (const row of result.rows) {
    const raw = row['__geom__'];
    if (raw == null) continue;
    let geometry: Geometry;
    try {
      geometry = typeof raw === 'string' ? (JSON.parse(raw) as Geometry) : (raw as Geometry);
    } catch {
      continue;
    }
    const properties: Record<string, unknown> = { ...row };
    delete properties['__geom__'];
    features.push({ type: 'Feature', geometry, properties });
  }
  return { type: 'FeatureCollection', features };
}

