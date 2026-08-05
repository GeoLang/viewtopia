/**
 * Main-thread client for the toolbox worker. One worker holds the initialized
 * topoi wasm module for the whole session, and runTool is the single place that
 * turns a configured tool into its op and positional arguments, so the panel
 * and the batch runner drive it the same way.
 */
import type { ToolId } from './catalog';
import type { Bbox } from './projection';
import type { GridKind, JoinPredicate, ValidateReport } from './topoi';

type Fc = GeoJSON.FeatureCollection;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
  }
  return worker;
}

function call<T>(op: string, args: unknown[]): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage({ id, op, args });
  });
}

export interface ToolInputs {
  /** primary input, absent only for the grids */
  a: Fc | null;
  /** overlay, clip or join source */
  b: Fc | null;
}

export interface ToolParams {
  distance: number;
  segments: number;
  tolerance: number;
  field: string;
  extent: Bbox | null;
  cellSize: number;
  predicate: JoinPredicate;
  prefix: string;
}

export type ToolOutput =
  | { kind: 'features'; geojson: Fc }
  | { kind: 'report'; report: ValidateReport };

function need<T>(value: T | null, what: string): T {
  if (!value) throw new Error(`pick ${what} first`);
  return value;
}

async function features(op: string, args: unknown[]): Promise<ToolOutput> {
  return { kind: 'features', geojson: await call<Fc>(op, args) };
}

export async function runTool(
  tool: ToolId,
  { a, b }: ToolInputs,
  p: ToolParams,
): Promise<ToolOutput> {
  const grid = (kind: GridKind) =>
    features('grid', [need(p.extent, 'an extent'), p.cellSize, kind]);

  switch (tool) {
    case 'buffer':
      return features('buffer', [need(a, 'an input layer'), p.distance, p.segments]);
    case 'simplify':
      return features('simplify', [need(a, 'an input layer'), p.tolerance]);
    case 'centroid':
      return features('centroid', [need(a, 'an input layer')]);
    case 'convex-hull':
      return features('convex-hull', [need(a, 'an input layer')]);
    case 'explode':
      return features('explode', [need(a, 'an input layer')]);
    case 'collect':
      return features('collect', [need(a, 'an input layer')]);
    case 'intersection':
    case 'difference':
    case 'clip':
      return features('overlay', [
        need(a, 'an input layer'),
        need(b, 'a second layer'),
        tool === 'clip' ? 'clip' : tool,
      ]);
    case 'clip-rect':
      return features('clip-rect', [need(a, 'an input layer'), need(p.extent, 'an extent')]);
    // union is a concatenation the panel already did, dissolved without a field
    case 'union':
      return features('dissolve', [need(a, 'the layers to union'), null]);
    case 'dissolve':
      return features('dissolve', [need(a, 'an input layer'), p.field || null]);
    case 'voronoi':
      return features('voronoi', [need(a, 'a point layer'), need(p.extent, 'an envelope')]);
    case 'grid-square':
      return grid('square');
    case 'grid-hex':
      return grid('hex');
    case 'spatial-join':
      return features('spatial-join', [
        need(a, 'a target layer'),
        need(b, 'a source layer'),
        p.predicate,
        p.prefix,
      ]);
    case 'make-valid':
      return features('make-valid', [need(a, 'an input layer')]);
    case 'validate':
      return {
        kind: 'report',
        report: await call<ValidateReport>('validate', [need(a, 'an input layer')]),
      };
  }
}
