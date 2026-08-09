/* tslint:disable */
/* eslint-disable */

export class Point {
    free(): void;
    [Symbol.dispose](): void;
    constructor(x: number, y: number, z: number);
    x: number;
    y: number;
    z: number;
}

export class Projection {
    free(): void;
    [Symbol.dispose](): void;
    constructor(defn: string);
    readonly axis: string;
    readonly isGeocentric: boolean;
    readonly isLatlon: boolean;
    readonly isNormalizedAxis: boolean;
    readonly projName: string;
    readonly to_meter: number;
    readonly units: string;
}

/**
 * Read a binary NTv2 from Dataview.
 *
 * Note: only NTv2 file format are supported.
 */
export function add_nadgrid(key: string, view: DataView): void;

export function main(): void;

export function toProjstring(src: string): string;

export function transform(src: Projection, dst: Projection, point: Point): void;

export function transform_coordinates(from: string, to: string, coordinates: Float64Array): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly transform_coordinates: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly main: () => void;
    readonly toProjstring: (a: number, b: number) => [number, number, number, number];
    readonly __wbg_get_point_x: (a: number) => number;
    readonly __wbg_get_point_y: (a: number) => number;
    readonly __wbg_get_point_z: (a: number) => number;
    readonly __wbg_point_free: (a: number, b: number) => void;
    readonly __wbg_projection_free: (a: number, b: number) => void;
    readonly __wbg_set_point_x: (a: number, b: number) => void;
    readonly __wbg_set_point_y: (a: number, b: number) => void;
    readonly __wbg_set_point_z: (a: number, b: number) => void;
    readonly point_new: (a: number, b: number, c: number) => number;
    readonly projection_axis: (a: number) => [number, number];
    readonly projection_isGeocentric: (a: number) => number;
    readonly projection_isLatlon: (a: number) => number;
    readonly projection_isNormalizedAxis: (a: number) => number;
    readonly projection_new: (a: number, b: number) => [number, number, number];
    readonly projection_projName: (a: number) => [number, number];
    readonly projection_to_meter: (a: number) => number;
    readonly projection_units: (a: number) => [number, number];
    readonly transform: (a: number, b: number, c: number) => [number, number];
    readonly add_nadgrid: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
