/**
 * Main-thread client for the space-time analysis worker. One worker serves the
 * whole session; every Analysis tab button goes through requestAnalysis.
 */
import type { AnalysisInput, AnalysisKind, AnalysisResult } from './run';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (value: AnalysisResult) => void; reject: (reason: Error) => void }
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

export function requestAnalysis(kind: AnalysisKind, input: AnalysisInput): Promise<AnalysisResult> {
  const id = ++seq;
  return new Promise<AnalysisResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, kind, input });
  });
}
