import { useEffect } from 'react';
import { BACKENDS, type BackendName } from '../offline/backends';
import { useAppStore } from '../store/app';

const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 30_000;

/**
 * Probes every platform service's health route on mount, every 30 seconds, and
 * whenever the browser says the network came back.
 */
export function useBackendDiscovery() {
  const setBackendStatus = useAppStore((s) => s.setBackendStatus);

  useEffect(() => {
    let mounted = true;

    const probeAll = async () => {
      const names = Object.keys(BACKENDS) as BackendName[];
      await Promise.all(
        names.map(async (name) => {
          let up = false;
          try {
            const res = await fetch(BACKENDS[name].healthPath, {
              signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            up = res.ok;
          } catch {
            up = false;
          }
          if (mounted) setBackendStatus(name, up ? 'up' : 'down');
        }),
      );
    };

    void probeAll();
    const interval = setInterval(() => void probeAll(), PROBE_INTERVAL_MS);
    const onOnline = () => void probeAll();
    window.addEventListener('online', onOnline);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [setBackendStatus]);
}
