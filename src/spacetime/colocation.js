/**
 * Colocation Detection — automatically identify when entities are near
 * each other in space and time.
 *
 * GeoTime-style: find entity meetings, convergence events, and
 * co-travel patterns.
 */

import { createLink, haversineM } from './models.js';

/**
 * @typedef {Object} ColocationEvent
 * @property {string} entityA
 * @property {string} entityB
 * @property {number} timestamp - midpoint time (Unix ms)
 * @property {number} lng - midpoint longitude
 * @property {number} lat - midpoint latitude
 * @property {number} distanceM - distance between entities
 * @property {number} timeDiffMs - time difference between events
 */

/**
 * Detect colocations: find pairs of events from different entities
 * that are within spatial and temporal thresholds.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Object} opts
 * @param {number} [opts.distanceThresholdM=100] - Max distance in meters
 * @param {number} [opts.timeThresholdMs=300000] - Max time difference (default 5 min)
 * @param {number} [opts.maxResults=1000] - Limit results
 * @returns {ColocationEvent[]}
 */
export function detectColocations(tracks, opts = {}) {
  const {
    distanceThresholdM = 100,
    timeThresholdMs = 300000,
    maxResults = 1000,
  } = opts;

  const results = [];

  // For each pair of tracks
  for (let i = 0; i < tracks.length && results.length < maxResults; i++) {
    for (let j = i + 1; j < tracks.length && results.length < maxResults; j++) {
      const trackA = tracks[i];
      const trackB = tracks[j];
      if (trackA.entityId === trackB.entityId) continue;

      // Use two-pointer approach on sorted events
      let ptrB = 0;
      for (let a = 0; a < trackA.events.length && results.length < maxResults; a++) {
        const evA = trackA.events[a];

        // Advance ptrB to be within time window
        while (ptrB < trackB.events.length && trackB.events[ptrB].timestamp < evA.timestamp - timeThresholdMs) {
          ptrB++;
        }

        // Check events in window
        for (let b = ptrB; b < trackB.events.length; b++) {
          const evB = trackB.events[b];
          if (evB.timestamp > evA.timestamp + timeThresholdMs) break;

          const dist = haversineM(evA.lat, evA.lng, evB.lat, evB.lng);
          if (dist <= distanceThresholdM) {
            results.push({
              entityA: trackA.entityId,
              entityB: trackB.entityId,
              timestamp: (evA.timestamp + evB.timestamp) / 2,
              lng: (evA.lng + evB.lng) / 2,
              lat: (evA.lat + evB.lat) / 2,
              distanceM: dist,
              timeDiffMs: Math.abs(evA.timestamp - evB.timestamp),
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Generate links from colocation events.
 * Groups colocations by entity pair and creates links with evidence counts.
 *
 * @param {ColocationEvent[]} colocations
 * @returns {import('./models.js').Link[]}
 */
export function colocationLinks(colocations) {
  const pairMap = new Map(); // "A:B" -> {events, firstSeen, lastSeen}

  for (const c of colocations) {
    const key = [c.entityA, c.entityB].sort().join(':');
    if (!pairMap.has(key)) {
      pairMap.set(key, { entityA: c.entityA, entityB: c.entityB, count: 0, firstSeen: Infinity, lastSeen: -Infinity });
    }
    const pair = pairMap.get(key);
    pair.count++;
    if (c.timestamp < pair.firstSeen) pair.firstSeen = c.timestamp;
    if (c.timestamp > pair.lastSeen) pair.lastSeen = c.timestamp;
  }

  const links = [];
  for (const pair of pairMap.values()) {
    links.push(createLink(pair.entityA, pair.entityB, 'colocation', {
      strength: Math.min(1.0, pair.count / 10),
      firstSeen: pair.firstSeen,
      lastSeen: pair.lastSeen,
      evidenceCount: pair.count,
    }));
  }

  return links;
}

/**
 * Detect co-travel: entities that move together over multiple time steps.
 * Requires at least `minSteps` consecutive colocations.
 *
 * @param {ColocationEvent[]} colocations
 * @param {Object} opts
 * @param {number} [opts.minSteps=3]
 * @param {number} [opts.maxGapMs=600000] - Max gap between co-travel steps (10 min)
 * @returns {Array<{entityA: string, entityB: string, startTime: number, endTime: number, steps: number}>}
 */
export function detectCoTravel(colocations, opts = {}) {
  const { minSteps = 3, maxGapMs = 600000 } = opts;

  // Group by entity pair, sort by time
  const pairMap = new Map();
  for (const c of colocations) {
    const key = [c.entityA, c.entityB].sort().join(':');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(c);
  }

  const results = [];
  for (const [key, events] of pairMap) {
    events.sort((a, b) => a.timestamp - b.timestamp);
    const [entityA, entityB] = key.split(':');

    let streakStart = 0;
    for (let i = 1; i <= events.length; i++) {
      const gap = i < events.length ? events[i].timestamp - events[i - 1].timestamp : Infinity;
      if (gap > maxGapMs || i === events.length) {
        const streakLen = i - streakStart;
        if (streakLen >= minSteps) {
          results.push({
            entityA, entityB,
            startTime: events[streakStart].timestamp,
            endTime: events[i - 1].timestamp,
            steps: streakLen,
          });
        }
        streakStart = i;
      }
    }
  }

  return results;
}
