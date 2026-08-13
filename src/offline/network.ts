/**
 * Network Status — detect online/offline state with event hooks.
 *
 * Uses navigator.onLine + periodic ping to detect real connectivity.
 */

import { create } from 'zustand';

interface NetworkState {
  online: boolean;
  /** Last time we confirmed actual connectivity */
  lastCheckedAt: number | null;
  /** Whether we're actively pinging to verify connectivity */
  checking: boolean;
}

export const useNetworkStore = create<NetworkState>(() => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastCheckedAt: null,
  checking: false,
}));

/** Check if currently online (synchronous, from store) */
export function isOnline(): boolean {
  return useNetworkStore.getState().online;
}

/**
 * Refuse a request that only a live network can answer, so the panel says the
 * user is offline instead of showing whatever the browser's failed fetch threw.
 */
export function requireOnline(what: string): void {
  if (isOnline()) return;
  throw new Error(`You are offline, and ${what} needs a network connection.`);
}

type NetworkListener = (online: boolean) => void;
const networkListeners = new Set<NetworkListener>();

/** Subscribe to network state changes */
export function onNetworkChange(fn: NetworkListener): () => void {
  networkListeners.add(fn);
  return () => networkListeners.delete(fn);
}

function setOnlineStatus(online: boolean) {
  const prev = useNetworkStore.getState().online;
  useNetworkStore.setState({ online, lastCheckedAt: Date.now() });
  if (prev !== online) {
    for (const fn of networkListeners) fn(online);
  }
}

/**
 * Verify actual connectivity by pinging the server.
 * navigator.onLine only tells us about the network adapter, not real connectivity.
 */
async function verifyConnectivity(): Promise<boolean> {
  useNetworkStore.setState({ checking: true });
  try {
    // Try to reach the app itself (a small static resource)
    const resp = await fetch('/manifest.json', {
      method: 'HEAD',
      cache: 'no-store',
    });
    const online = resp.ok;
    setOnlineStatus(online);
    return online;
  } catch {
    setOnlineStatus(false);
    return false;
  } finally {
    useNetworkStore.setState({ checking: false });
  }
}

let checkInterval: ReturnType<typeof setInterval> | null = null;

/** Initialize network monitoring — call once at app startup */
export function initNetworkMonitor(): void {
  // Listen for browser online/offline events
  window.addEventListener('online', () => {
    setOnlineStatus(true);
    // Verify with a real request
    verifyConnectivity();
  });

  window.addEventListener('offline', () => {
    setOnlineStatus(false);
  });

  // Periodic connectivity check (every 30s when online, 10s when offline)
  function scheduleCheck() {
    if (checkInterval) clearInterval(checkInterval);
    const interval = useNetworkStore.getState().online ? 30_000 : 10_000;
    checkInterval = setInterval(() => {
      verifyConnectivity();
    }, interval);
  }

  // Initial check
  verifyConnectivity().then(() => scheduleCheck());

  // Adjust interval when status changes
  onNetworkChange(() => scheduleCheck());
}
