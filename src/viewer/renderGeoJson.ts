/**
 * Shared GeoJSON renderer for the active Cesium viewer. Used by the add_geojson
 * viewer command and the sql_query command so both load layers the same way.
 */
import { Color, GeoJsonDataSource } from 'cesium';
import { getActiveCesiumViewer } from './registry';

/**
 * Load a GeoJSON object onto the active Cesium viewer, styled with color.
 * Returns the created data source (or undefined when no viewer) so callers can
 * remove it later. Pass a `name` to tag the layer for lookup/removal.
 */
export async function renderGeoJson(
  data: object,
  color = '#3388ff',
  fit = true,
  name?: string,
): Promise<GeoJsonDataSource | undefined> {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return undefined;
  const ds = await GeoJsonDataSource.load(data, {
    stroke: Color.fromCssColorString(color),
    fill: Color.fromCssColorString(color).withAlpha(0.4),
    strokeWidth: 2,
  });
  if (name) ds.name = name;
  await viewer.dataSources.add(ds);
  if (fit) await viewer.flyTo(ds);
  return ds;
}
