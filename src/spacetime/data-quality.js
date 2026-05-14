/**
 * Data Quality — detect GPS outliers, impossible speeds, and bad fixes.
 *
 * Flags events that are likely errors based on:
 * - Impossible speed (> threshold between consecutive points)
 * - Altitude anomalies
 * - Precision issues (0,0 coordinates)
 * - Duplicate timestamps
 */

import { haversineM } from './models.js';

/**
 * @typedef {Object} QualityIssue
 * @property {string} type - 'teleport'|'zero_coord'|'duplicate_time'|'impossible_speed'|'altitude_spike'
 * @property {string} entityId
 * @property {number} eventIndex
 * @property {number} timestamp
 * @property {string} description
 * @property {string} severity - 'warning'|'error'
 */

/**
 * Run quality checks on all tracks.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Object} opts
 * @param {number} [opts.maxSpeedKmh=1000] - Max plausible speed (1000 km/h = fast jet)
 * @param {number} [opts.maxAltitudeM=50000] - Max plausible altitude
 * @returns {QualityIssue[]}
 */
export function detectQualityIssues(tracks, opts = {}) {
  const { maxSpeedKmh = 1000, maxAltitudeM = 50000 } = opts;
  const maxSpeedMs = (maxSpeedKmh * 1000) / 3600; // m/s
  const issues = [];

  for (const track of tracks) {
    const events = track.events;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];

      // Zero coordinates (null island)
      if (e.lng === 0 && e.lat === 0) {
        issues.push({
          type: 'zero_coord',
          entityId: track.entityId,
          eventIndex: i,
          timestamp: e.timestamp,
          description: 'Coordinates are (0, 0) — likely a null/missing value',
          severity: 'error',
        });
      }

      // Invalid coordinate range
      if (Math.abs(e.lng) > 180 || Math.abs(e.lat) > 90) {
        issues.push({
          type: 'invalid_coord',
          entityId: track.entityId,
          eventIndex: i,
          timestamp: e.timestamp,
          description: `Coordinates out of range: (${e.lng}, ${e.lat})`,
          severity: 'error',
        });
      }

      // Altitude spike
      if (e.altitudeM != null && (e.altitudeM > maxAltitudeM || e.altitudeM < -500)) {
        issues.push({
          type: 'altitude_spike',
          entityId: track.entityId,
          eventIndex: i,
          timestamp: e.timestamp,
          description: `Altitude ${e.altitudeM}m is outside plausible range`,
          severity: 'warning',
        });
      }

      // Check against previous event
      if (i > 0) {
        const prev = events[i - 1];

        // Duplicate timestamp
        if (e.timestamp === prev.timestamp) {
          issues.push({
            type: 'duplicate_time',
            entityId: track.entityId,
            eventIndex: i,
            timestamp: e.timestamp,
            description: 'Duplicate timestamp with previous event',
            severity: 'warning',
          });
        }

        // Impossible speed / teleportation
        const dtMs = e.timestamp - prev.timestamp;
        if (dtMs > 0) {
          const dist = haversineM(prev.lat, prev.lng, e.lat, e.lng);
          const speed = dist / (dtMs / 1000); // m/s

          if (speed > maxSpeedMs) {
            issues.push({
              type: 'impossible_speed',
              entityId: track.entityId,
              eventIndex: i,
              timestamp: e.timestamp,
              description: `Speed ${(speed * 3.6).toFixed(0)} km/h between events (${dist.toFixed(0)}m in ${(dtMs / 1000).toFixed(0)}s)`,
              severity: speed > maxSpeedMs * 10 ? 'error' : 'warning',
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Remove flagged events from tracks (clean the data).
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {QualityIssue[]} issues
 * @param {string[]} [removeTypes] - Which issue types to remove (default: errors only)
 * @returns {number} Number of events removed
 */
export function removeQualityIssues(tracks, issues, removeTypes) {
  const types = removeTypes || ['zero_coord', 'invalid_coord'];
  const toRemove = new Map(); // entityId -> Set of eventIndices

  for (const issue of issues) {
    if (!types.includes(issue.type)) continue;
    if (!toRemove.has(issue.entityId)) toRemove.set(issue.entityId, new Set());
    toRemove.get(issue.entityId).add(issue.eventIndex);
  }

  let removed = 0;
  for (const track of tracks) {
    const removeSet = toRemove.get(track.entityId);
    if (!removeSet || removeSet.size === 0) continue;

    const newEvents = track.events.filter((_, i) => !removeSet.has(i));
    removed += track.events.length - newEvents.length;
    track.events = newEvents;

    if (track.events.length > 0) {
      track.startTime = track.events[0].timestamp;
      track.endTime = track.events[track.events.length - 1].timestamp;
    }
  }

  return removed;
}

/**
 * Get quality summary statistics.
 */
export function qualitySummary(issues) {
  const byType = {};
  let errors = 0, warnings = 0;
  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
    if (issue.severity === 'error') errors++;
    else warnings++;
  }
  return { total: issues.length, errors, warnings, byType };
}
