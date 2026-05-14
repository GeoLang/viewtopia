import type { Track } from '../types';
import { haversineM } from './geo';

export interface QualityIssue {
  type: 'teleport' | 'zero_coord' | 'duplicate_time' | 'impossible_speed' | 'altitude_spike' | 'invalid_coord';
  entityId: string;
  eventIndex: number;
  timestamp: number;
  description: string;
  severity: 'warning' | 'error';
}

export interface QualityOptions {
  maxSpeedKmh?: number;
  maxAltitudeM?: number;
}

/**
 * Run quality checks on all tracks.
 */
export function detectQualityIssues(tracks: Track[], opts: QualityOptions = {}): QualityIssue[] {
  const { maxSpeedKmh = 1000, maxAltitudeM = 50000 } = opts;
  const maxSpeedMs = (maxSpeedKmh * 1000) / 3600;
  const issues: QualityIssue[] = [];

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
      if (e.altitude != null && (e.altitude > maxAltitudeM || e.altitude < -500)) {
        issues.push({
          type: 'altitude_spike',
          entityId: track.entityId,
          eventIndex: i,
          timestamp: e.timestamp,
          description: `Altitude ${e.altitude}m is outside plausible range`,
          severity: 'warning',
        });
      }

      // Check against previous event
      if (i > 0) {
        const prev = events[i - 1];

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

        const dtMs = e.timestamp - prev.timestamp;
        if (dtMs > 0) {
          const dist = haversineM(prev.lat, prev.lng, e.lat, e.lng);
          const speed = dist / (dtMs / 1000);

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
 * Summary of quality issues.
 */
export function qualitySummary(issues: QualityIssue[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const issue of issues) {
    summary[issue.type] = (summary[issue.type] || 0) + 1;
  }
  return summary;
}
