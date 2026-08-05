/**
 * Vector ops backed by topoi compiled to WASM (src/toolbox/wasm/), the same
 * geometry engine the platform runs server-side. The module must be initialized
 * before any call: the worker does it with the bundled .wasm URL, tests with
 * initSync over the file bytes.
 *
 * Collections cross the boundary as GeoJSON text and every op runs in meters,
 * so each wrapper projects its inputs into one shared frame and unprojects the
 * result. Distances, tolerances and cell sizes are therefore meters everywhere.
 */
import * as wasm from './wasm/topoi_wasm';
import {
  bboxOf,
  frameFor,
  projectBbox,
  projectFc,
  unprojectFc,
  type Bbox,
  type Frame,
} from './projection';

type Fc = GeoJSON.FeatureCollection;

export type OverlayOp = 'intersection' | 'difference' | 'clip';
export type JoinPredicate = 'intersects' | 'within' | 'nearest';
export type GridKind = 'square' | 'hex';

export interface ValidationIssue {
  kind: string;
  message: string;
}

export interface ValidateReport {
  valid: boolean;
  invalid: { feature: number; issues: ValidationIssue[] }[];
}

function planar(fc: Fc, frame: Frame): string {
  return JSON.stringify(projectFc(fc, frame));
}

function geographic(json: string, frame: Frame): Fc {
  return unprojectFc(JSON.parse(json) as Fc, frame);
}

export function topoiBuffer(fc: Fc, distance: number, segments: number): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcBuffer(planar(fc, frame), distance, segments), frame);
}

export function topoiSimplify(fc: Fc, tolerance: number): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcSimplify(planar(fc, frame), tolerance), frame);
}

export function topoiCentroid(fc: Fc): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcCentroid(planar(fc, frame)), frame);
}

export function topoiConvexHull(fc: Fc): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcConvexHull(planar(fc, frame)), frame);
}

export function topoiDissolve(fc: Fc, by: string | null): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcDissolve(planar(fc, frame), by || null), frame);
}

export function topoiOverlay(a: Fc, b: Fc, op: OverlayOp): Fc {
  const frame = frameFor(bboxOf([a, b]));
  return geographic(wasm.fcOverlay(planar(a, frame), planar(b, frame), op), frame);
}

export function topoiClipRect(fc: Fc, rect: Bbox): Fc {
  const frame = frameFor(bboxOf([fc], [rect]));
  const [minX, minY, maxX, maxY] = projectBbox(rect, frame);
  return geographic(wasm.fcClipRect(planar(fc, frame), minX, minY, maxX, maxY), frame);
}

export function topoiVoronoi(fc: Fc, envelope: Bbox): Fc {
  const frame = frameFor(bboxOf([fc], [envelope]));
  const [minX, minY, maxX, maxY] = projectBbox(envelope, frame);
  return geographic(wasm.fcVoronoi(planar(fc, frame), minX, minY, maxX, maxY), frame);
}

export function topoiGrid(extent: Bbox, cellSize: number, kind: GridKind): Fc {
  const frame = frameFor(extent);
  const [minX, minY, maxX, maxY] = projectBbox(extent, frame);
  return geographic(wasm.fcGrid(minX, minY, maxX, maxY, cellSize, kind), frame);
}

export function topoiSpatialJoin(
  target: Fc,
  source: Fc,
  predicate: JoinPredicate,
  prefix: string,
): Fc {
  const frame = frameFor(bboxOf([target, source]));
  return geographic(
    wasm.fcSpatialJoin(planar(target, frame), planar(source, frame), predicate, prefix),
    frame,
  );
}

export function topoiMakeValid(fc: Fc): Fc {
  const frame = frameFor(bboxOf([fc]));
  return geographic(wasm.fcMakeValid(planar(fc, frame)), frame);
}

/** A report rather than a collection, so nothing comes back to unproject. */
export function topoiValidate(fc: Fc): ValidateReport {
  const frame = frameFor(bboxOf([fc]));
  return JSON.parse(wasm.fcValidate(planar(fc, frame))) as ValidateReport;
}
