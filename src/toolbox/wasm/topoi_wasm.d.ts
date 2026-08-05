/* tslint:disable */
/* eslint-disable */

/**
 * Compute the bounding box of a set of points.
 * Returns: {min_x, min_y, max_x, max_y}.
 */
export function boundingBox(points_js: any): any;

/**
 * Buffer a polygon by a given distance, with round joins.
 * Input: JsPolygon JSON, distance float (negative shrinks).
 * Returns: JSON array of JsPolygon, since growing can merge pieces and
 * shrinking can split or erase the input.
 */
export function bufferPolygon(polygon_js: any, distance: number): any;

/**
 * Clip a polygon to a rectangle (bbox).
 * Input: JsPolygon JSON, bbox bounds.
 * Returns: JSON array of JsPolygon, since a clip can split the input into
 * several pieces or leave holes intact.
 */
export function clipToRect(polygon_js: any, min_x: number, min_y: number, max_x: number, max_y: number): any;

/**
 * Compute the convex hull of a set of points.
 * Input: JSON array of {x, y} objects.
 * Returns: JSON array of {x, y} objects forming the hull polygon exterior.
 */
export function convexHull(points_js: any): any;

/**
 * Compute Delaunay triangulation of a point set.
 * Input: JSON array of {x, y} objects.
 * Returns: JsTriangulation with array of triangle vertex triples.
 */
export function delaunayTriangulation(points_js: any): any;

/**
 * Buffer every feature of a GeoJSON FeatureCollection, keeping properties.
 */
export function fcBuffer(fc_json: string, distance: number, segments: number): string;

/**
 * Replace every geometry with its centroid.
 */
export function fcCentroid(fc_json: string): string;

/**
 * Clip every geometry to an axis-aligned rectangle.
 */
export function fcClipRect(fc_json: string, min_x: number, min_y: number, max_x: number, max_y: number): string;

/**
 * One convex hull over every coordinate in the collection.
 */
export function fcConvexHull(fc_json: string): string;

/**
 * Union the polygon features, grouped by the `by` property when given.
 */
export function fcDissolve(fc_json: string, by?: string | null): string;

/**
 * A grid covering a rectangle. `kind` is "square" or "hex".
 */
export function fcGrid(min_x: number, min_y: number, max_x: number, max_y: number, cell_size: number, kind: string): string;

/**
 * Repair every feature, keeping properties.
 */
export function fcMakeValid(fc_json: string): string;

/**
 * Overlay two collections. `op` is "intersection", "difference" or "clip".
 */
export function fcOverlay(a_json: string, b_json: string, op: string): string;

/**
 * Douglas-Peucker every linestring and polygon ring.
 */
export function fcSimplify(fc_json: string, tolerance: number): string;

/**
 * Join source properties onto target features. `predicate` is "intersects",
 * "within" or "nearest".
 */
export function fcSpatialJoin(target_json: string, source_json: string, predicate: string, prefix: string): string;

/**
 * Validity issues per feature, as a JSON report rather than a collection.
 */
export function fcValidate(fc_json: string): string;

/**
 * Voronoi cells over the point features, clipped to the given rectangle.
 */
export function fcVoronoi(fc_json: string, min_x: number, min_y: number, max_x: number, max_y: number): string;

/**
 * Test if a point is inside a polygon.
 * Input: {x, y} point and JsPolygon.
 * Returns: boolean.
 */
export function pointInPolygon(point_js: any, polygon_js: any): boolean;

/**
 * Subject minus clip.
 * Input: two JSON arrays of JsPolygon.
 * Returns: JSON array of JsPolygon.
 */
export function polygonDifference(subject_js: any, clip_js: any): any;

/**
 * Intersection of two polygon sets.
 * Input: two JSON arrays of JsPolygon.
 * Returns: JSON array of JsPolygon.
 */
export function polygonIntersection(subject_js: any, clip_js: any): any;

/**
 * Union of two polygon sets.
 * Input: two JSON arrays of JsPolygon.
 * Returns: JSON array of JsPolygon.
 */
export function polygonUnion(subject_js: any, clip_js: any): any;

/**
 * Symmetric difference of two polygon sets.
 * Input: two JSON arrays of JsPolygon.
 * Returns: JSON array of JsPolygon.
 */
export function polygonXor(subject_js: any, clip_js: any): any;

/**
 * Test if two polygons intersect.
 */
export function polygonsIntersect(a_js: any, b_js: any): boolean;

/**
 * Simplify a polyline using Douglas-Peucker algorithm.
 * Input: JSON array of {x, y}, tolerance float.
 * Returns: simplified JSON array of {x, y}.
 */
export function simplifyLine(points_js: any, tolerance: number): any;

/**
 * Split a polygon with a cutting polyline.
 * Input: JsPolygon JSON, JSON array of {x, y} forming the cut line.
 * Returns: JSON array of JsPolygon, one per resulting piece.
 */
export function splitPolygon(polygon_js: any, line_js: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly boundingBox: (a: any) => [number, number, number];
    readonly bufferPolygon: (a: any, b: number) => [number, number, number];
    readonly clipToRect: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly convexHull: (a: any) => [number, number, number];
    readonly delaunayTriangulation: (a: any) => [number, number, number];
    readonly fcBuffer: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly fcCentroid: (a: number, b: number) => [number, number, number, number];
    readonly fcClipRect: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly fcConvexHull: (a: number, b: number) => [number, number, number, number];
    readonly fcDissolve: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly fcGrid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly fcMakeValid: (a: number, b: number) => [number, number, number, number];
    readonly fcOverlay: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly fcSimplify: (a: number, b: number, c: number) => [number, number, number, number];
    readonly fcSpatialJoin: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly fcValidate: (a: number, b: number) => [number, number, number, number];
    readonly fcVoronoi: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly pointInPolygon: (a: any, b: any) => [number, number, number];
    readonly polygonDifference: (a: any, b: any) => [number, number, number];
    readonly polygonIntersection: (a: any, b: any) => [number, number, number];
    readonly polygonUnion: (a: any, b: any) => [number, number, number];
    readonly polygonXor: (a: any, b: any) => [number, number, number];
    readonly polygonsIntersect: (a: any, b: any) => [number, number, number];
    readonly simplifyLine: (a: any, b: number) => [number, number, number];
    readonly splitPolygon: (a: any, b: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
