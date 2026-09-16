import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// maplibre looks for its worker beside its own module url, which the bundler moves
export function registerMapLibreWorker(): void {
  setWorkerUrl(workerUrl);
}
