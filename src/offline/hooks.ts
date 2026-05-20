/**
 * React hook for offline/sync status.
 * Provides reactive online state and sync status for UI components.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNetworkStore } from './network';
import { onSyncStateChange, getSyncState, syncNow, discardPending } from './sync';

/** Use current online/offline state */
export function useOnlineStatus() {
  return useNetworkStore((s) => s.online);
}

/** Use sync state (pending count, status, last sync time) */
export function useSyncStatus() {
  const [state, setState] = useState(getSyncState);

  useEffect(() => {
    return onSyncStateChange(setState);
  }, []);

  const triggerSync = useCallback(() => syncNow(), []);
  const discard = useCallback(() => discardPending(), []);

  return { ...state, triggerSync, discard };
}
