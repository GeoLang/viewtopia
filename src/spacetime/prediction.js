/**
 * Predictive Location — estimate where an entity will be in the future
 * based on pattern-of-life analysis.
 *
 * Uses historical movement patterns to predict likely locations
 * at a given future time.
 */

import { computeDailyPattern, detectFrequentLocations } from './pattern-of-life.js';
import { haversineM } from './models.js';

/**
 * @typedef {Object} LocationPrediction
 * @property {number} lng
 * @property {number} lat
 * @property {number} confidence - 0.0 to 1.0
 * @property {string} basis - 'hourly_pattern'|'frequent_location'|'linear_extrapolation'
 * @property {string} label - Human-readable prediction description
 */

/**
 * Predict where an entity will be at a given future time.
 *
 * Uses three strategies:
 * 1. Hourly pattern (where are they usually at this hour?)
 * 2. Frequent locations (what's their most common location?)
 * 3. Linear extrapolation (project from recent movement vector)
 *
 * @param {import('./models.js').Track} track
 * @param {number} futureTimestamp
 * @returns {LocationPrediction[]}
 */
export function predictLocation(track, futureTimestamp) {
  const predictions = [];

  if (track.events.length < 3) return predictions;

  // Strategy 1: Hourly pattern
  const pattern = computeDailyPattern(track);
  const hour = new Date(futureTimestamp).getUTCHours();
  const hourPattern = pattern[hour];
  if (hourPattern.sampleCount >= 3) {
    // Confidence based on sample count and spatial consistency
    const confidence = Math.min(0.9, hourPattern.sampleCount / 20) *
      (hourPattern.stdDevM > 0 ? Math.max(0.1, 1 - hourPattern.stdDevM / 50000) : 0.5);
    predictions.push({
      lng: hourPattern.avgLng,
      lat: hourPattern.avgLat,
      confidence,
      basis: 'hourly_pattern',
      label: `Typical location at ${hour}:00 (${hourPattern.sampleCount} samples, ±${(hourPattern.stdDevM / 1000).toFixed(1)}km)`,
    });
  }

  // Strategy 2: Frequent locations
  const freqLocs = detectFrequentLocations(track, { minVisits: 3 });
  if (freqLocs.length > 0) {
    // Find the frequent location most visited at this hour
    const hourLocs = freqLocs.filter(l => l.visitHours.includes(hour));
    const bestLoc = hourLocs.length > 0 ? hourLocs[0] : freqLocs[0];
    predictions.push({
      lng: bestLoc.lng,
      lat: bestLoc.lat,
      confidence: Math.min(0.8, bestLoc.visitCount / 15),
      basis: 'frequent_location',
      label: `${bestLoc.label} (${bestLoc.visitCount} visits)`,
    });
  }

  // Strategy 3: Linear extrapolation from last few events
  const recent = track.events.slice(-5);
  if (recent.length >= 2) {
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    const dt = last.timestamp - prev.timestamp;

    if (dt > 0) {
      const futDt = futureTimestamp - last.timestamp;
      const scale = futDt / dt;

      // Don't extrapolate too far (confidence drops with distance)
      const predictedLng = last.lng + (last.lng - prev.lng) * scale;
      const predictedLat = last.lat + (last.lat - prev.lat) * scale;

      // Confidence drops exponentially with extrapolation distance
      const extrapolationHours = futDt / 3600000;
      const confidence = Math.max(0.05, Math.exp(-extrapolationHours / 2) * 0.7);

      predictions.push({
        lng: predictedLng,
        lat: predictedLat,
        confidence,
        basis: 'linear_extrapolation',
        label: `Linear projection (${extrapolationHours.toFixed(1)}h ahead)`,
      });
    }
  }

  return predictions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Predict for multiple entities.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {number} futureTimestamp
 * @returns {Map<string, LocationPrediction[]>}
 */
export function predictAllLocations(tracks, entities, futureTimestamp) {
  const results = new Map();
  for (const track of tracks) {
    const preds = predictLocation(track, futureTimestamp);
    if (preds.length > 0) {
      results.set(track.entityId, preds);
    }
  }
  return results;
}
