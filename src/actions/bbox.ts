import type { Bbox } from '../lib/terrainAnalysis';
import { ActionError } from './registry';

const BBOX_CORNERS = 4;

/** A [west, south, east, north] argument, in degrees, as the actions take it. */
export function readBbox(value: unknown): Bbox {
  const corners = (value as unknown[]).map(Number);
  if (corners.length !== BBOX_CORNERS || !corners.every(Number.isFinite)) {
    throw new ActionError('a bbox is four numbers: west, south, east, north');
  }
  const [west, south, east, north] = corners;
  if (east <= west || north <= south) {
    throw new ActionError(`${value} is not a box: east is past west and north is past south`);
  }
  return [west, south, east, north];
}

/** The same box as a closed ring, wound anticlockwise from its south west corner. */
export function bboxPolygon([west, south, east, north]: Bbox): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}
