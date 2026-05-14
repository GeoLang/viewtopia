/**
 * Space-Time module entry point.
 *
 * Re-exports the public API for easy consumption from ViewTopia's main app.
 */

export {
  createEntity, createEvent, createTrack,
  createLink,
  createTimeRange, timeRangeDurationMs, timeRangeContains, timeRangeExpand, timeRangeNormalize,
  haversineM, trackDistanceM,
} from './models.js';
export { createSpaceTimeLayers, createLinkLayer, getTimeBounds } from './layers.js';
export { ingestCSV, ingestGPX, ingestJSON, ingestFile } from './ingest.js';
export { initSpaceTime, loadSpaceTimeData, clearSpaceTimeData } from './panel.js';
export { SpaceTimeIndex } from './index-spatial.js';

// Entity management
export {
  initEntityManager, addEntity, updateEntity, deleteEntity,
  addAlias, removeAlias, mergeEntities, searchEntities,
  getEntitiesByKind, getEntityKinds, showEntityDetail,
} from './entity-manager.js';

// Colocation detection
export {
  detectColocations, colocationLinks, detectCoTravel,
} from './colocation.js';

// Pattern-of-life
export {
  detectFrequentLocations, computeDailyPattern, detectAnomalies, classifyLocations,
} from './pattern-of-life.js';

// Geo-fencing
export {
  createCircleFence, createPolygonFence, removeFence, getFences, clearFences,
  isInsideFence, detectFenceCrossings, summarizeFenceActivity,
} from './geofence.js';

// Network graph
export { showNetworkGraph, hideNetworkGraph } from './network-graph.js';

// Activity histogram
export { computeHistogram, showActivityHistogram, hideActivityHistogram } from './activity-histogram.js';

// Additional ingest formats (KML, GeoJSON)
export { ingestKML, ingestGeoJSON } from './ingest-formats.js';

// Binary columnar store (performance)
export {
  createBinaryStore, appendEvent, appendTracks, sortByTimestamp,
  getStoreBounds, queryTimeRange, querySpatioTemporal, toBinaryAttributes,
  getEntityEventCounts,
} from './binary-store.js';

// Web Worker analysis pool
export { runAnalysis, workersAvailable, terminateWorker } from './worker-pool.js';

// Viewport tiling
export { queryViewport, buildRenderData, viewportChanged, computeTimeWindow } from './viewport-tiling.js';

// IndexedDB persistence
export { saveSession, loadSession, clearSession, getStoredEventCount } from './persistence.js';

// Virtual scrolling
export { createVirtualList, setVirtualListItems, scrollToItem, filterVirtualList } from './virtual-scroll.js';

// Entity timeline swimlanes
export { showSwimlanePanelUI, hideSwimlanePanelUI } from './swimlanes.js';

// CDR import
export { ingestCDR } from './ingest-cdr.js';

// Social network metrics
export {
  computeDegree, computeBetweenness, computeCloseness,
  computePageRank, detectCommunities, computeAllMetrics,
} from './network-metrics.js';

// Export (KML, CSV, video)
export { exportKML, exportCSV, exportLinksCSV, downloadFile, captureVideo } from './export.js';

// Data quality / GPS outlier detection
export { detectQualityIssues, removeQualityIssues, qualitySummary } from './data-quality.js';

// Behavioral clustering
export { extractFeatures, clusterEntities } from './clustering.js';

// Predictive location
export { predictLocation, predictAllLocations } from './prediction.js';

// Alerting rules
export {
  createGeofenceEntryRule, createProximityRule, createSpeedRule, createInactivityRule,
  removeRule, getRules, getAlerts, clearAlerts, evaluateRules,
} from './alerting.js';

// Audit trail
export {
  recordAction, getAuditLog, getRecentActions, filterLog,
  clearAuditLog, exportAuditCSV, showAuditPanel, hideAuditPanel,
} from './audit-trail.js';
