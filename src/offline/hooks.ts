/**
 * React hook for offline/sync status.
 * Provides reactive online state and sync status for UI components.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNetworkStore } from './network';
import {
  onSyncStateChange,
  getSyncState,
  syncNow,
  discardPending,
  applyConflictResolutions,
  clearConflicts,
} from './sync';
import type { ConflictResolution } from './conflicts';

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
  const resolveConflicts = useCallback(
    (resolutions: ConflictResolution[]) => applyConflictResolutions(resolutions),
    [],
  );
  const dismissConflicts = useCallback(() => clearConflicts(), []);

  return { ...state, triggerSync, discard, resolveConflicts, dismissConflicts };
}
