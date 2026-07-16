import { useEffect } from 'react';
import { useAppStore } from '../store/app';

/**
 * Probes backend health on mount and periodically.
 */
export function useBackendDiscovery() {
  const setBackendStatus = useAppStore((s) => s.setBackendStatus);

  useEffect(() => {
    let mounted = true;

    const probe = async () => {
      let tt = false;
      let gl = false;

      try {
        const res = await fetch('/tiles/v1/health', { signal: AbortSignal.timeout(3000) });
        tt = res.ok;
      } catch {
        /* offline */
      }

      try {
        const res = await fetch('/agent/health', { signal: AbortSignal.timeout(3000) });
        gl = res.ok;
      } catch {
        /* offline */
      }

      if (mounted) setBackendStatus(tt, gl);
    };

    probe();
    const interval = setInterval(probe, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [setBackendStatus]);
}
