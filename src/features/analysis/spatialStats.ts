/**
 * Binning points into a grid and reducing each cell. The Spatial Statistics
 * panel and the chat both draw the same deck grid and read the same summary.
 */

import { GridLayer } from '@deck.gl/aggregation-layers';
import {
  gridSummary,
  gridWeight,
  showPanelDeckLayer,
  type GridAggregation,
  type GridSummary,
  type PointRecord,
} from '../../lib/pointData';

export const SPATIAL_STATS_GROUP = 'panel-spatialstats';
export const GRID_AGGREGATIONS = ['count', 'sum', 'mean'] as const;
export const DEFAULT_CELL_METERS = 500;
export const MIN_CELL_METERS = 50;
export const MAX_CELL_METERS = 5000;

const DECK_AGGREGATIONS: Record<GridAggregation, 'COUNT' | 'SUM' | 'MEAN'> = {
  count: 'COUNT',
  sum: 'SUM',
  mean: 'MEAN',
};

const CELL_VALUE_DECIMALS = 2;

/** Cell values can be fractional means, so trim them to something readable. */
export function formatCellValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(CELL_VALUE_DECIMALS);
}

export interface GriddedPoints {
  summary: GridSummary;
  /** the reduction as it reads back, "mean(height)" or "count" */
  label: string;
}

export function showSpatialStatsGrid(
  points: PointRecord[],
  method: GridAggregation,
  property: string | null,
  cellMeters: number,
): GriddedPoints {
  // count has no weight to read, so the property only applies to sum/mean
  const weightProperty = method === 'count' ? null : property;
  const aggregation = DECK_AGGREGATIONS[method];
  showPanelDeckLayer(
    SPATIAL_STATS_GROUP,
    new GridLayer<PointRecord>({
      id: `panel-grid-${Date.now()}`,
      data: points,
      getPosition: (point) => point.position,
      getColorWeight: (point) => gridWeight(point, weightProperty),
      colorAggregation: aggregation,
      getElevationWeight: (point) => gridWeight(point, weightProperty),
      elevationAggregation: aggregation,
      cellSize: cellMeters,
      // gpu aggregation allocates a bin for every cell in the data extent
      gpuAggregation: false,
      extruded: true,
      pickable: true,
    }),
  );
  return {
    summary: gridSummary(points, cellMeters, method, weightProperty),
    label: weightProperty ? `${method}(${weightProperty})` : method,
  };
}
