export function createWorkerCall(spawnWorker: () => Worker) {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  function getWorker(): Worker {
    if (!worker) {
      // vite bundles a worker only when its caller writes new Worker(new URL(...)) literally
      worker = spawnWorker();
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

  return function call<T>(op: string, args: unknown[]): Promise<T> {
    const id = ++seq;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      getWorker().postMessage({ id, op, args });
    });
  };
}
