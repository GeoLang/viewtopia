/**
 * Toolbox compute worker: initializes the topoi wasm module once, then serves
 * engine.ts requests. Collections are structured-cloned in and out, which is
 * what keeps a whole-layer buffer off the UI thread.
 */
import init from './wasm/topoi_wasm';
import { collect, explode } from './multipart';
import {
  topoiBuffer,
  topoiCentroid,
  topoiClipRect,
  topoiConvexHull,
  topoiDissolve,
  topoiGrid,
  topoiMakeValid,
  topoiOverlay,
  topoiSimplify,
  topoiSpatialJoin,
  topoiValidate,
  topoiVoronoi,
} from './topoi';

export type WorkerRequest = { id: number; op: string; args: never[] };

const ops: Record<string, (...args: never[]) => unknown> = {
  buffer: topoiBuffer,
  simplify: topoiSimplify,
  centroid: topoiCentroid,
  'convex-hull': topoiConvexHull,
  dissolve: topoiDissolve,
  overlay: topoiOverlay,
  'clip-rect': topoiClipRect,
  voronoi: topoiVoronoi,
  grid: topoiGrid,
  'spatial-join': topoiSpatialJoin,
  validate: topoiValidate,
  'make-valid': topoiMakeValid,
  explode,
  collect,
};

let ready: Promise<unknown> | null = null;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, args } = e.data;
  try {
    ready ??= init({ module_or_path: new URL('./wasm/topoi_wasm_bg.wasm', import.meta.url) });
    await ready;
    const run = ops[op];
    if (!run) throw new Error(`unknown toolbox op ${op}`);
    self.postMessage({ id, ok: true, result: run(...args) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
