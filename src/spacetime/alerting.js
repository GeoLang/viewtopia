/**
 * Alerting Rules — define conditions that trigger notifications.
 *
 * GeoTime-style: analysts set up rules like "notify when entity
 * enters zone" or "alert when two subjects meet". Rules are evaluated
 * as new data arrives or during playback.
 */

import { isInsideFence } from './geofence.js';
import { haversineM } from './models.js';

/**
 * @typedef {Object} AlertRule
 * @property {string} id
 * @property {string} name
 * @property {'geofence_enter'|'geofence_exit'|'entity_proximity'|'speed_threshold'|'inactivity'} type
 * @property {Object} params
 * @property {boolean} enabled
 * @property {Function} [onTrigger] - Callback when triggered
 */

/**
 * @typedef {Object} Alert
 * @property {string} ruleId
 * @property {string} ruleName
 * @property {string} entityId
 * @property {number} timestamp
 * @property {string} message
 */

let rules = [];
let ruleIdCounter = 0;
let alerts = [];

/**
 * Create a geofence entry alert rule.
 */
export function createGeofenceEntryRule(name, fence, entityIds, onTrigger) {
  const rule = {
    id: `rule-${++ruleIdCounter}`,
    name,
    type: 'geofence_enter',
    params: { fence, entityIds },
    enabled: true,
    onTrigger,
  };
  rules.push(rule);
  return rule;
}

/**
 * Create an entity proximity alert rule.
 */
export function createProximityRule(name, entityA, entityB, distanceM, onTrigger) {
  const rule = {
    id: `rule-${++ruleIdCounter}`,
    name,
    type: 'entity_proximity',
    params: { entityA, entityB, distanceM },
    enabled: true,
    onTrigger,
  };
  rules.push(rule);
  return rule;
}

/**
 * Create a speed threshold alert rule.
 */
export function createSpeedRule(name, entityIds, maxSpeedKmh, onTrigger) {
  const rule = {
    id: `rule-${++ruleIdCounter}`,
    name,
    type: 'speed_threshold',
    params: { entityIds, maxSpeedKmh },
    enabled: true,
    onTrigger,
  };
  rules.push(rule);
  return rule;
}

/**
 * Create an inactivity alert rule.
 */
export function createInactivityRule(name, entityIds, thresholdMs, onTrigger) {
  const rule = {
    id: `rule-${++ruleIdCounter}`,
    name,
    type: 'inactivity',
    params: { entityIds, thresholdMs },
    enabled: true,
    onTrigger,
  };
  rules.push(rule);
  return rule;
}

/**
 * Remove a rule.
 */
export function removeRule(id) {
  rules = rules.filter(r => r.id !== id);
}

/**
 * Get all rules.
 */
export function getRules() {
  return rules;
}

/**
 * Get all alerts.
 */
export function getAlerts() {
  return alerts;
}

/**
 * Clear alerts.
 */
export function clearAlerts() {
  alerts = [];
}

/**
 * Evaluate all rules against current state.
 * Called during animation or when new data arrives.
 *
 * @param {import('./models.js').Track[]} tracks
 * @param {number} currentTime
 * @returns {Alert[]} New alerts triggered
 */
export function evaluateRules(tracks, currentTime) {
  const newAlerts = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.type) {
      case 'geofence_enter':
        newAlerts.push(...evalGeofenceRule(rule, tracks, currentTime));
        break;
      case 'entity_proximity':
        newAlerts.push(...evalProximityRule(rule, tracks, currentTime));
        break;
      case 'speed_threshold':
        newAlerts.push(...evalSpeedRule(rule, tracks, currentTime));
        break;
      case 'inactivity':
        newAlerts.push(...evalInactivityRule(rule, tracks, currentTime));
        break;
    }
  }

  alerts.push(...newAlerts);
  for (const alert of newAlerts) {
    const rule = rules.find(r => r.id === alert.ruleId);
    rule?.onTrigger?.(alert);
  }

  return newAlerts;
}

function getLatestPosition(tracks, entityId, beforeTime) {
  for (const track of tracks) {
    if (track.entityId !== entityId) continue;
    for (let i = track.events.length - 1; i >= 0; i--) {
      if (track.events[i].timestamp <= beforeTime) return track.events[i];
    }
  }
  return null;
}

function evalGeofenceRule(rule, tracks, currentTime) {
  const { fence, entityIds } = rule.params;
  const newAlerts = [];

  for (const entityId of (entityIds || [])) {
    const pos = getLatestPosition(tracks, entityId, currentTime);
    if (!pos) continue;
    if (isInsideFence(fence, pos.lng, pos.lat)) {
      // Check if we already alerted for this entity recently
      const recentAlert = alerts.find(a => a.ruleId === rule.id && a.entityId === entityId &&
        currentTime - a.timestamp < 60000);
      if (recentAlert) continue;

      newAlerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        entityId,
        timestamp: currentTime,
        message: `Entity entered "${fence.name || 'fence'}"`,
      });
    }
  }

  return newAlerts;
}

function evalProximityRule(rule, tracks, currentTime) {
  const { entityA, entityB, distanceM } = rule.params;
  const posA = getLatestPosition(tracks, entityA, currentTime);
  const posB = getLatestPosition(tracks, entityB, currentTime);
  if (!posA || !posB) return [];

  const dist = haversineM(posA.lat, posA.lng, posB.lat, posB.lng);
  if (dist > distanceM) return [];

  const recentAlert = alerts.find(a => a.ruleId === rule.id && currentTime - a.timestamp < 60000);
  if (recentAlert) return [];

  return [{
    ruleId: rule.id,
    ruleName: rule.name,
    entityId: entityA,
    timestamp: currentTime,
    message: `Entities within ${dist.toFixed(0)}m of each other`,
  }];
}

function evalSpeedRule(rule, tracks, currentTime) {
  const { entityIds, maxSpeedKmh } = rule.params;
  const maxSpeedMs = (maxSpeedKmh * 1000) / 3600;
  const newAlerts = [];

  for (const entityId of (entityIds || [])) {
    const track = tracks.find(t => t.entityId === entityId);
    if (!track || track.events.length < 2) continue;

    // Check last two events before currentTime
    let prev = null, curr = null;
    for (const e of track.events) {
      if (e.timestamp > currentTime) break;
      prev = curr;
      curr = e;
    }
    if (!prev || !curr) continue;

    const dt = (curr.timestamp - prev.timestamp) / 1000;
    if (dt <= 0) continue;
    const dist = haversineM(prev.lat, prev.lng, curr.lat, curr.lng);
    const speed = dist / dt;

    if (speed > maxSpeedMs) {
      const recentAlert = alerts.find(a => a.ruleId === rule.id && a.entityId === entityId &&
        currentTime - a.timestamp < 60000);
      if (recentAlert) continue;

      newAlerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        entityId,
        timestamp: currentTime,
        message: `Speed ${(speed * 3.6).toFixed(0)} km/h exceeds ${maxSpeedKmh} km/h threshold`,
      });
    }
  }

  return newAlerts;
}

function evalInactivityRule(rule, tracks, currentTime) {
  const { entityIds, thresholdMs } = rule.params;
  const newAlerts = [];

  for (const entityId of (entityIds || [])) {
    const pos = getLatestPosition(tracks, entityId, currentTime);
    if (!pos) continue;

    const gap = currentTime - pos.timestamp;
    if (gap > thresholdMs) {
      const recentAlert = alerts.find(a => a.ruleId === rule.id && a.entityId === entityId &&
        currentTime - a.timestamp < 300000);
      if (recentAlert) continue;

      newAlerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        entityId,
        timestamp: currentTime,
        message: `No activity for ${(gap / 60000).toFixed(0)} minutes`,
      });
    }
  }

  return newAlerts;
}
