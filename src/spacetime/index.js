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
