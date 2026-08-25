/**
 * Space-time analysis worker. Colocation is quadratic in the pair scan and
 * Brandes walks every entity, so a 100k-point import blocks the UI thread for
 * seconds if these run on it. Tracks are structured-cloned in, the result marks
 * come back out.
 */
import { runAnalysis, type AnalysisInput, type AnalysisKind } from './run';

export interface AnalysisRequest {
  id: number;
  kind: AnalysisKind;
  input: AnalysisInput;
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, kind, input } = e.data;
  try {
    self.postMessage({ id, ok: true, result: runAnalysis(kind, input) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: (error as Error).message });
  }
};
