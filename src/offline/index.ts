/**
 * Offline module — barrel export.
 */

export { layers, features, annotations, pendingOps, apiCache, tileCache } from './db';
export type { OfflineLayer, OfflineFeature, OfflineAnnotation, PendingOperation, CachedResponse, CachedTile } from './db';
export { initSync, syncNow, discardPending, queueOperation, onSyncStateChange, getSyncState, clearConflicts, ConflictError } from './sync';
export { isOnline, useNetworkStore, initNetworkMonitor, onNetworkChange } from './network';
export { offlineFetch, precacheUrls, cacheTilesForArea } from './cache';
export { useOnlineStatus, useSyncStatus } from './hooks';
export { OfflineIndicator } from './OfflineIndicator';
export { threeWayMerge, batchMerge, resolveAllConflicts, resolveConflictManually } from './conflicts';
export type { MergeConflict, MergeResult, FeatureVersion, ConflictType, ConflictStrategy } from './conflicts';
export { ConflictResolver } from './ConflictResolver';
