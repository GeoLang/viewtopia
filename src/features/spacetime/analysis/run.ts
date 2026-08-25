import type { Link, SpaceTimeEvent, TimeRange, Track } from '../types';
import { eventsInWindow } from '../cube';
import { detectColocations } from './colocation';
import { detectCoTravel } from './co-travel';
import { computeDailyPattern, detectAnomalies, detectFrequentLocations } from './pattern-of-life';
import { computeBetweenness, computeDegree } from './network-metrics';
import { clusterEntities } from './clustering';
import { predictLocation } from './prediction';
import { detectQualityIssues, qualitySummary } from './data-quality';

export type AnalysisKind =
  | 'colocation'
  | 'cotravel'
  | 'pattern'
  | 'network'
  | 'clustering'
  | 'prediction'
  | 'quality';

type Rgba = [number, number, number, number];

/** One line in the panel's results list. `id` is stamped by runAnalysis. */
interface RowText {
  label: string;
  detail: string;
}

export interface AnalysisRow extends RowText {
  id: string;
}

/**
 * A mark the deck layers draw. `ringRadiusM` swaps the pixel radius for a metre
 * one drawn as an outline, which is how a dwell ring differs from a marker.
 */
export interface AnalysisPoint {
  lng: number;
  lat: number;
  timestamp: number;
  color: Rgba;
  radius: number;
  ringRadiusM: number | null;
  label: string;
}

export interface AnalysisPath {
  points: { lng: number; lat: number; timestamp: number }[];
  color: Rgba;
  width: number;
  label: string;
}

export interface AnalysisResult {
  kind: AnalysisKind;
  title: string;
  rows: AnalysisRow[];
  points: AnalysisPoint[];
  paths: AnalysisPath[];
}

/** What each analysis builds; runAnalysis turns it into an AnalysisResult. */
type DraftResult = Omit<AnalysisResult, 'rows'> & { rows: RowText[] };

export interface AnalysisInput {
  tracks: Track[];
  links: Link[];
  entities: { id: string; name: string }[];
  timeRange: TimeRange;
}

/** How far past the end of the data a prediction is asked for. */
export const PREDICTION_HORIZON_MS = 3_600_000;

/** Rows past this are counted in the title instead of listed. */
export const ANALYSIS_ROW_LIMIT = 50;

/** Colocation is capped at 1000 by default, too low to chain long co-travel runs. */
const COTRAVEL_MEETING_LIMIT = 20_000;

const MEETING_COLOR: Rgba = [255, 99, 72, 230];
const DWELL_COLOR: Rgba = [72, 187, 255, 180];
const ANOMALY_COLOR: Rgba = [255, 140, 220, 230];
const PREDICTION_COLOR: Rgba = [235, 235, 255, 150];
const COTRAVEL_COLOR: Rgba = [80, 250, 160, 230];
const QUALITY_ERROR_COLOR: Rgba = [255, 70, 70, 240];
const QUALITY_WARNING_COLOR: Rgba = [255, 196, 0, 230];

const CLUSTER_COLORS: Rgba[] = [
  [167, 139, 250, 255],
  [45, 212, 191, 255],
  [251, 146, 60, 255],
  [244, 114, 182, 255],
  [132, 204, 22, 255],
  [96, 165, 250, 255],
];

const MEETING_RADIUS = 7;
const ANOMALY_RADIUS = 6;
const PREDICTION_RADIUS = 10;
const QUALITY_RADIUS = 6;
const CLUSTER_PATH_WIDTH = 5;
const COTRAVEL_PATH_WIDTH = 6;
const PREDICTION_PATH_WIDTH = 2;

/** Dwell ring size grows with visits and stays readable at one visit. */
const DWELL_RING_BASE_M = 40;
const DWELL_RING_PER_VISIT_M = 25;

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

function trim(rows: RowText[]): RowText[] {
  return rows.slice(0, ANALYSIS_ROW_LIMIT);
}

function empty(kind: AnalysisKind, title: string): DraftResult {
  return { kind, title, rows: [], points: [], paths: [] };
}

function pathOf(events: SpaceTimeEvent[], color: Rgba, width: number, label: string): AnalysisPath {
  return {
    points: events.map((e) => ({ lng: e.lng, lat: e.lat, timestamp: e.timestamp })),
    color,
    width,
    label,
  };
}

function colocation(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const meetings = detectColocations(input.tracks);
  if (meetings.length === 0) return empty('colocation', 'No meetings found');

  return {
    kind: 'colocation',
    title: `${meetings.length} meetings`,
    rows: trim(
      meetings.map((m) => ({
        label: `${nameOf(m.entityA)} + ${nameOf(m.entityB)}`,
        detail: `${m.distanceM.toFixed(0)} m apart, ${new Date(m.timestamp).toLocaleString()}`,
      })),
    ),
    points: meetings.map((m) => ({
      lng: m.lng,
      lat: m.lat,
      timestamp: m.timestamp,
      color: MEETING_COLOR,
      radius: MEETING_RADIUS,
      ringRadiusM: null,
      label: `${nameOf(m.entityA)} + ${nameOf(m.entityB)}`,
    })),
    paths: [],
  };
}

function coTravel(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const runs = detectCoTravel(input.tracks, { maxResults: COTRAVEL_MEETING_LIMIT });
  if (runs.length === 0) return empty('cotravel', 'No sustained co-travel found');

  const trackOf = new Map(input.tracks.map((t) => [t.entityId, t]));
  const paths: AnalysisPath[] = [];

  for (const run of runs) {
    const label = `${nameOf(run.entityA)} with ${nameOf(run.entityB)}`;
    for (const entityId of [run.entityA, run.entityB]) {
      const track = trackOf.get(entityId);
      if (!track) continue;
      const segment = eventsInWindow(track.events, run.endTime, run.durationMs);
      if (segment.length >= 2) {
        paths.push(pathOf(segment, COTRAVEL_COLOR, COTRAVEL_PATH_WIDTH, label));
      }
    }
  }

  return {
    kind: 'cotravel',
    title: `${runs.length} co-travel runs`,
    rows: trim(
      runs.map((run) => ({
        label: `${nameOf(run.entityA)} with ${nameOf(run.entityB)}`,
        detail: `${minutes(run.durationMs)} together, ${run.meanDistanceM.toFixed(0)} m apart on average`,
      })),
    ),
    points: [],
    paths,
  };
}

function pattern(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const rows: RowText[] = [];
  const points: AnalysisPoint[] = [];

  for (const track of input.tracks) {
    const name = nameOf(track.entityId);
    const frequent = detectFrequentLocations(track);
    const anomalies = detectAnomalies(track);
    const daily = computeDailyPattern(track);
    const busiest = daily.reduce((best, hour) => (hour.sampleCount > best.sampleCount ? hour : best));

    for (const location of frequent) {
      points.push({
        lng: location.lng,
        lat: location.lat,
        timestamp: input.timeRange.min,
        color: DWELL_COLOR,
        radius: 0,
        ringRadiusM: DWELL_RING_BASE_M + location.visitCount * DWELL_RING_PER_VISIT_M,
        label: `${name} — ${location.label}, ${location.visitCount} visits`,
      });
    }

    for (const index of anomalies) {
      const event = track.events[index];
      if (!event) continue;
      points.push({
        lng: event.lng,
        lat: event.lat,
        timestamp: event.timestamp,
        color: ANOMALY_COLOR,
        radius: ANOMALY_RADIUS,
        ringRadiusM: null,
        label: `${name} — off pattern at ${new Date(event.timestamp).toLocaleString()}`,
      });
    }

    const busiestDetail =
      busiest.sampleCount > 0 ? `busiest around ${busiest.hour}:00 UTC` : 'no repeated hours';
    rows.push({
      label: name,
      detail: `${frequent.length} frequent locations, ${anomalies.length} anomalies, ${busiestDetail}`,
    });
  }

  if (points.length === 0 && rows.length === 0) return empty('pattern', 'No tracks to profile');

  return {
    kind: 'pattern',
    title: `${points.filter((p) => p.ringRadiusM !== null).length} dwell locations`,
    rows: trim(rows),
    points,
    paths: [],
  };
}

function network(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const entityIds = input.entities.map((e) => e.id);
  if (entityIds.length === 0) return empty('network', 'No entities to rank');

  const degree = computeDegree(entityIds, input.links);
  const betweenness = computeBetweenness(entityIds, input.links);

  const ranked = entityIds
    .map((id) => ({ id, degree: degree.get(id) ?? 0, betweenness: betweenness.get(id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree || b.betweenness - a.betweenness);

  return {
    kind: 'network',
    title: `${entityIds.length} entities over ${input.links.length} links`,
    rows: trim(
      ranked.map((entry) => ({
        label: nameOf(entry.id),
        detail: `degree ${entry.degree.toFixed(2)}, betweenness ${entry.betweenness.toFixed(2)}`,
      })),
    ),
    points: [],
    paths: [],
  };
}

function clustering(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  if (input.tracks.length === 0) return empty('clustering', 'No tracks to cluster');

  const clusters = clusterEntities(input.tracks);
  const colorOf = new Map<string, Rgba>();
  const rows: RowText[] = [];

  for (const [clusterIndex, entityIds] of clusters) {
    const color = CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
    for (const entityId of entityIds) colorOf.set(entityId, color);
    rows.push({
      label: `Cluster ${clusterIndex + 1}`,
      detail: entityIds.map(nameOf).join(', '),
    });
  }

  const paths = input.tracks
    .filter((track) => track.events.length >= 2)
    .map((track) =>
      pathOf(
        track.events,
        colorOf.get(track.entityId) ?? CLUSTER_COLORS[0],
        CLUSTER_PATH_WIDTH,
        nameOf(track.entityId),
      ),
    );

  return {
    kind: 'clustering',
    title: `${clusters.size} behavioral clusters`,
    rows: trim(rows),
    points: [],
    paths,
  };
}

function prediction(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const futureTimestamp = input.timeRange.max + PREDICTION_HORIZON_MS;
  const rows: RowText[] = [];
  const points: AnalysisPoint[] = [];
  const paths: AnalysisPath[] = [];

  for (const track of input.tracks) {
    const predictions = predictLocation(track, futureTimestamp);
    if (predictions.length === 0) continue;

    const name = nameOf(track.entityId);
    for (const p of predictions) {
      rows.push({
        label: `${name} — ${p.basis.replace(/_/g, ' ')}`,
        detail: `${p.label}, confidence ${(p.confidence * 100).toFixed(0)}%`,
      });
    }

    const best = predictions.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    points.push({
      lng: best.lng,
      lat: best.lat,
      timestamp: futureTimestamp,
      color: PREDICTION_COLOR,
      radius: PREDICTION_RADIUS,
      ringRadiusM: null,
      label: `${name} — predicted, ${(best.confidence * 100).toFixed(0)}%`,
    });

    const last = track.events[track.events.length - 1];
    if (last) {
      paths.push({
        points: [
          { lng: last.lng, lat: last.lat, timestamp: last.timestamp },
          { lng: best.lng, lat: best.lat, timestamp: futureTimestamp },
        ],
        color: PREDICTION_COLOR,
        width: PREDICTION_PATH_WIDTH,
        label: `${name} — projected`,
      });
    }
  }

  if (points.length === 0) return empty('prediction', 'No track has enough history to predict');

  return {
    kind: 'prediction',
    title: `${points.length} predicted locations, ${minutes(PREDICTION_HORIZON_MS)} ahead`,
    rows: trim(rows),
    points,
    paths,
  };
}

function quality(input: AnalysisInput, nameOf: (id: string) => string): DraftResult {
  const issues = detectQualityIssues(input.tracks);
  if (issues.length === 0) return empty('quality', 'No quality issues found');

  const trackOf = new Map(input.tracks.map((t) => [t.entityId, t]));
  const points: AnalysisPoint[] = [];

  for (const issue of issues) {
    const event = trackOf.get(issue.entityId)?.events[issue.eventIndex];
    if (!event) continue;
    points.push({
      lng: event.lng,
      lat: event.lat,
      timestamp: event.timestamp,
      color: issue.severity === 'error' ? QUALITY_ERROR_COLOR : QUALITY_WARNING_COLOR,
      radius: QUALITY_RADIUS,
      ringRadiusM: null,
      label: `${nameOf(issue.entityId)} — ${issue.description}`,
    });
  }

  const summary = qualitySummary(issues);
  const byType = Object.entries(summary)
    .map(([type, count]) => `${count} ${type.replace(/_/g, ' ')}`)
    .join(', ');

  return {
    kind: 'quality',
    title: `${issues.length} issues: ${byType}`,
    rows: trim(
      issues.map((issue) => ({
        label: `${nameOf(issue.entityId)} — ${issue.type.replace(/_/g, ' ')}`,
        detail: issue.description,
      })),
    ),
    points,
    paths: [],
  };
}

const ANALYSES: Record<
  AnalysisKind,
  (input: AnalysisInput, nameOf: (id: string) => string) => DraftResult
> = {
  colocation,
  cotravel: coTravel,
  pattern,
  network,
  clustering,
  prediction,
  quality,
};

/**
 * Runs one analysis and returns both its result rows and the marks the deck
 * layers draw. Pure and synchronous: the worker is the only thing that calls it
 * off the main thread.
 */
export function runAnalysis(kind: AnalysisKind, input: AnalysisInput): AnalysisResult {
  const names = new Map(input.entities.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const draft = ANALYSES[kind](input, nameOf);
  return {
    ...draft,
    rows: draft.rows.map((row, index) => ({ ...row, id: `${kind}-${index}` })),
  };
}
