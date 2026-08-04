/* tslint:disable */
/* eslint-disable */

export function applyBinary(a: Float64Array, b: Float64Array, width: number, height: number, cell_size: number, nodata: number, op: string): Float64Array;

export function applyUnary(data: Float64Array, width: number, height: number, cell_size: number, nodata: number, op: string, operand: number): Float64Array;

export function aspect(data: Float64Array, width: number, height: number, cell_size: number, nodata: number): Float64Array;

export function contours(data: Float64Array, width: number, height: number, cell_size: number, nodata: number, interval: number, base: number): Float64Array;

export function fillSinks(data: Float64Array, width: number, height: number, cell_size: number, nodata: number): Float64Array;

export function hillshade(data: Float64Array, width: number, height: number, cell_size: number, nodata: number, azimuth: number, altitude: number): Float64Array;

/**
 * (a - b) / (a + b), the NDVI/NDWI family, composed from the same binary ops
 * a calculator would use so nodata and zero-sum cells behave identically.
 */
export function normalizedDifference(a: Float64Array, b: Float64Array, width: number, height: number, cell_size: number, nodata: number): Float64Array;

/**
 * `classes` is flat (min_inclusive, max_exclusive, new_value) triples.
 */
export function reclassify(data: Float64Array, width: number, height: number, cell_size: number, nodata: number, classes: Float64Array): Float64Array;

export function slope(data: Float64Array, width: number, height: number, cell_size: number, nodata: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly applyBinary: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly applyUnary: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly aspect: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly contours: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly fillSinks: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly hillshade: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly normalizedDifference: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly reclassify: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly slope: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
