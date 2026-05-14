/**
 * Analysis Worker — offloads heavy computation to a Web Worker.
 *
 * Runs colocation detection, pattern-of-life, and geofence analysis
 * off the main thread so the UI stays responsive during analysis
 * of large datasets.
 */

import { detectColocations, colocationLinks, detectCoTravel } from './colocation.js';
import { detectFrequentLocations, computeDailyPattern, detectAnomalies } from './pattern-of-life.js';
import { detectFenceCrossings, summarizeFenceActivity, isInsideFence } from './geofence.js';

self.onmessage = function (e) {
  const { type, payload, id } = e.data;

  try {
    let result;
    switch (type) {
      case 'colocation':
        result = runColocation(payload);
        break;
      case 'pattern-of-life':
        result = runPatternOfLife(payload);
        break;
      case 'geofence':
        result = runGeofence(payload);
        break;
      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

function runColocation({ tracks, distanceThresholdM, timeThresholdMs }) {
  const colocations = detectColocations(tracks, { distanceThresholdM, timeThresholdMs });
  const links = colocationLinks(colocations);
  const coTravel = detectCoTravel(colocations);
  return { colocations, links, coTravel };
}

function runPatternOfLife({ tracks }) {
  const results = [];
  for (const track of tracks) {
    const locs = detectFrequentLocations(track);
    const pattern = computeDailyPattern(track);
    const anomalies = detectAnomalies(track, pattern);
    results.push({
      entityId: track.entityId,
      frequentLocations: locs,
      dailyPattern: pattern,
      anomalies,
    });
  }
  return results;
}

function runGeofence({ tracks, fences }) {
  const crossings = detectFenceCrossings(tracks, fences);
  const summary = Object.fromEntries(
    [...summarizeFenceActivity(crossings)].map(([k, v]) => [k, Object.fromEntries(v)])
  );
  return { crossings, summary };
}
