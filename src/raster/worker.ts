/**
 * Raster compute worker: initializes the terrano wasm module once, then
 * serves engine.ts requests. Results carrying a Float32Array transfer their
 * buffer back instead of copying, inputs are cloned in (the panel keeps its
 * band arrays across runs).
 */
import init from './wasm/terrano_wasm';
import {
  terranoAspect,
  terranoContours,
  terranoHillshade,
  terranoNdvi,
  terranoReclass,
  terranoSlope,
} from './terrano';

export type WorkerRequest = { id: number; op: string; args: never[] };

const ops: Record<string, (...args: never[]) => unknown> = {
  ndvi: terranoNdvi,
  hillshade: terranoHillshade,
  slope: terranoSlope,
  aspect: terranoAspect,
  reclass: terranoReclass,
  contours: terranoContours,
};

let ready: Promise<unknown> | null = null;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, args } = e.data;
  try {
    ready ??= init({ module_or_path: new URL('./wasm/terrano_wasm_bg.wasm', import.meta.url) });
    await ready;
    const run = ops[op];
    if (!run) throw new Error(`unknown raster op ${op}`);
    const result = run(...args);
    const transfer =
      result && typeof result === 'object' && 'data' in result && result.data instanceof Float32Array
        ? [result.data.buffer as ArrayBuffer]
        : [];
    self.postMessage({ id, ok: true, result }, { transfer });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
