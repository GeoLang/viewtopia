/**
 * Worker Pool — manages analysis Web Workers with a simple promise-based API.
 *
 * Usage:
 *   const result = await runAnalysis('colocation', { tracks, distanceThresholdM: 100, timeThresholdMs: 300000 });
 */

let worker = null;
let msgId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL('./analysis-worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const resolver = pending.get(id);
      if (!resolver) return;
      pending.delete(id);
      if (error) resolver.reject(new Error(error));
      else resolver.resolve(result);
    };
    worker.onerror = (e) => {
      // Reject all pending with generic error
      for (const [id, resolver] of pending) {
        resolver.reject(new Error(`Worker error: ${e.message}`));
      }
      pending.clear();
    };
  }
  return worker;
}

/**
 * Run an analysis task on the worker thread.
 *
 * @param {'colocation'|'pattern-of-life'|'geofence'} type
 * @param {Object} payload - Task-specific data
 * @returns {Promise<any>}
 */
export function runAnalysis(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type, payload, id });
  });
}

/**
 * Check if Web Workers are available.
 */
export function workersAvailable() {
  return typeof Worker !== 'undefined';
}

/**
 * Terminate the worker (cleanup).
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    for (const [id, resolver] of pending) {
      resolver.reject(new Error('Worker terminated'));
    }
    pending.clear();
  }
}
