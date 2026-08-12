// Client for ptolemy's industry-vertical endpoints (verticals module, nested under
// /api/v1) and itinera's delivery optimizer (/api/delivery). Branch ids are resolved
// by dataset name via discoverBranch, so a panel degrades to an empty state when the
// vertical's dataset has not been created yet instead of hard-failing.

import { apiHeaders, noticeRefusal } from './apiAuth';
import { discoverBranch } from './realEstate';

export { discoverBranch };

const API = '/api/v1';

// Conventional dataset names each vertical's features live in. discoverBranch returns
// null when the dataset is absent; panels treat that as "not configured".
export const SENSORS_DATASET = 'sensors';
export const TOWERS_DATASET = 'towers';
export const FIELDS_DATASET = 'fields';
export const INCIDENTS_DATASET = 'incidents';
export const CONSTRUCTION_DATASET = 'construction';

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: apiHeaders(init?.headers),
  });
  if (!res.ok) {
    noticeRefusal(res.status);
    throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Environmental — sensors ─────────────────────────────────────────
export interface SensorInfo {
  id: string;
  name: string | null;
  sensor_type: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  properties: Record<string, unknown>;
}

export function listSensors(branchId: string, limit = 200): Promise<SensorInfo[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<SensorInfo[]>(`/sensors?${params}`);
}

// ── Telecom — towers ────────────────────────────────────────────────
export interface TowerInfo {
  id: string;
  name: string | null;
  technology: string | null;
  height_m: number | null;
  frequency_mhz: number | null;
  lat: number | null;
  lng: number | null;
  properties: Record<string, unknown>;
}

export function listTowers(branchId: string, limit = 200): Promise<TowerInfo[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<TowerInfo[]>(`/towers?${params}`);
}

// ── Agriculture — fields, NDVI ──────────────────────────────────────
export interface FieldInfo {
  id: string;
  name: string | null;
  crop: string | null;
  area_ha: number | null;
  soil_type: string | null;
  properties: Record<string, unknown>;
}

export function listFields(branchId: string, limit = 200): Promise<FieldInfo[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<FieldInfo[]>(`/fields?${params}`);
}

export interface NdviResponse {
  field_id: string;
  mean_ndvi: number | null;
  min_ndvi: number | null;
  max_ndvi: number | null;
  timestamp: string | null;
  health_classification: string;
}

export function fieldNdvi(branchId: string, fieldId: string): Promise<NdviResponse> {
  const params = new URLSearchParams({ branch_id: branchId, field_id: fieldId });
  return apiJson<NdviResponse>(`/fields/ndvi?${params}`);
}

// ── Construction — surveys, milestones ──────────────────────────────
export interface SurveyInfo {
  id: string;
  name: string | null;
  date: string | null;
  point_count: number | null;
  mean_elevation: number | null;
}

export function listSurveys(branchId: string, limit = 200): Promise<SurveyInfo[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<SurveyInfo[]>(`/construction/surveys?${params}`);
}

export interface Milestone {
  id: string;
  name: string | null;
  status: string | null;
  due_date: string | null;
  completion_pct: number | null;
  planned_pct: number | null;
}

export function listMilestones(branchId: string, limit = 200): Promise<Milestone[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<Milestone[]>(`/construction/milestones?${params}`);
}

export interface ElevationStats {
  mean_diff: number;
  max_cut: number;
  max_fill: number;
  net_volume_m3: number;
}

export interface SurveyCompareResult {
  survey_a: string;
  survey_b: string;
  point_count_a: number;
  point_count_b: number;
  elevation_diff_stats: ElevationStats | null;
}

export function compareSurveys(
  branchId: string,
  surveyA: string,
  surveyB: string,
): Promise<SurveyCompareResult> {
  return apiJson<SurveyCompareResult>('/surveys/compare', {
    method: 'POST',
    body: JSON.stringify({ branch_id: branchId, survey_a: surveyA, survey_b: surveyB }),
  });
}

// ── Emergency — incidents ───────────────────────────────────────────
export interface IncidentInfo {
  id: string;
  incident_type: string | null;
  severity: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  reported_at: string | null;
  description: string | null;
  properties: Record<string, unknown>;
}

export function listIncidents(branchId: string, limit = 200): Promise<IncidentInfo[]> {
  const params = new URLSearchParams({ branch_id: branchId, limit: String(limit) });
  return apiJson<IncidentInfo[]>(`/incidents?${params}`);
}

export interface CreateIncidentInput {
  branchId: string;
  incidentType: string;
  severity: string;
  lat: number;
  lng: number;
  description: string;
  author: string;
}

export function createIncident(input: CreateIncidentInput): Promise<IncidentInfo> {
  return apiJson<IncidentInfo>('/incidents', {
    method: 'POST',
    body: JSON.stringify({
      branch_id: input.branchId,
      incident_type: input.incidentType,
      severity: input.severity,
      lat: input.lat,
      lng: input.lng,
      description: input.description,
      author: input.author,
    }),
  });
}

// ── Logistics — delivery optimization (itinera, not /api/v1) ─────────
export interface OrderedStop {
  id: string;
  lat: number;
  lng: number;
  sequence: number;
}

export interface DeliveryOptimizeResult {
  ordered_stops: OrderedStop[];
  total_distance_m: number;
  estimated_duration_s: number;
}

export async function optimizeDelivery(
  depot: { lat: number; lng: number },
  stops: Array<{ id: string; lat: number; lng: number }>,
  returnToDepot = false,
): Promise<DeliveryOptimizeResult> {
  const res = await fetch('/api/delivery/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ depot, stops, return_to_depot: returnToDepot }),
  });
  if (!res.ok) {
    throw new Error(`delivery/optimize failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<DeliveryOptimizeResult>;
}
