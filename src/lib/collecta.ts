// Client for collecta's field data collection service, proxied at /collecta/
// (nginx strips the prefix, so /collecta/api/v1/forms reaches the server's
// /api/v1/forms). Every route needs the platform bearer, and reads answer only
// for the form's creator, its grantees and admins, so an empty list is a
// permission answer as much as a data one.

import { apiHeaders, noticeRefusal } from './apiAuth';

const API = '/collecta/api/v1';

export interface CollectaForm {
  id: string;
  title: string;
  version: number;
  fieldCount: number;
}

export interface CollectaAttachment {
  id: string;
  fieldName: string;
  filename: string;
  mimeType: string;
}

/** What the panel shows per submission beside the layer: identity and files. */
export interface SubmissionInfo {
  id: string;
  completedAt: string | null;
  collectorId: string | null;
  attachments: CollectaAttachment[];
  located: boolean;
}

export interface SubmissionLayer {
  geojson: GeoJSON.FeatureCollection;
  submissions: SubmissionInfo[];
}

export class CollectaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The server's `{error}` body, falling back to the status when it has none. */
async function failure(res: Response): Promise<CollectaError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    typeof body?.error === 'string' && body.error ? body.error : `HTTP ${res.status}`;
  return new CollectaError(res.status, message);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { ...init, headers: apiHeaders(init?.headers) }).catch(() => null);
  if (!res) throw new CollectaError(0, 'The field data service is unreachable.');
  if (!res.ok) {
    noticeRefusal(res.status);
    throw await failure(res);
  }
  return res;
}

export async function listForms(): Promise<CollectaForm[]> {
  const res = await request(`${API}/forms`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return [];
  return body.flatMap((raw) => {
    const f = raw as Record<string, unknown> | null;
    if (!f || typeof f.id !== 'string') return [];
    return [
      {
        id: f.id,
        title: typeof f.title === 'string' && f.title ? f.title : f.id,
        version: typeof f.version === 'number' ? f.version : 0,
        fieldCount: typeof f.field_count === 'number' ? f.field_count : 0,
      },
    ];
  });
}

export function attachmentUrl(id: string): string {
  return `${API}/attachments/${encodeURIComponent(id)}`;
}

/**
 * The attachment bytes as an object URL, because an `<img>` cannot carry the
 * Authorization header. The caller owns the URL and must revoke it.
 */
export async function attachmentObjectUrl(id: string): Promise<string> {
  const res = await request(attachmentUrl(id));
  return URL.createObjectURL(await res.blob());
}

// collecta serializes a field value externally tagged: {"Text": "x"},
// {"GeoPoint": {latitude, longitude}}, {"GeoTrace": [points]}, ...
type TaggedValue = Record<string, unknown>;

interface RawPoint {
  latitude?: unknown;
  longitude?: unknown;
  altitude?: unknown;
}

function position(raw: unknown): GeoJSON.Position | null {
  const p = raw as RawPoint | null;
  if (typeof p?.latitude !== 'number' || typeof p.longitude !== 'number') return null;
  return typeof p.altitude === 'number'
    ? [p.longitude, p.latitude, p.altitude]
    : [p.longitude, p.latitude];
}

function positions(raw: unknown): GeoJSON.Position[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(position).filter((p): p is GeoJSON.Position => p !== null);
}

/** One submission value as geometry, or null when the tag is not spatial. */
function valueGeometry(value: TaggedValue): GeoJSON.Geometry | null {
  if ('GeoPoint' in value) {
    const point = position(value.GeoPoint);
    return point ? { type: 'Point', coordinates: point } : null;
  }
  if ('GeoTrace' in value) {
    const line = positions(value.GeoTrace);
    return line.length >= 2 ? { type: 'LineString', coordinates: line } : null;
  }
  if ('GeoShape' in value) {
    const ring = positions(value.GeoShape);
    if (ring.length < 3) return null;
    const [firstLon, firstLat] = ring[0];
    const [lastLon, lastLat] = ring[ring.length - 1];
    const closed = firstLon === lastLon && firstLat === lastLat ? ring : [...ring, ring[0]];
    return { type: 'Polygon', coordinates: [closed] };
  }
  return null;
}

/** One submission value as a table cell, or undefined for spatial/file/repeat tags. */
function valueProperty(value: TaggedValue): string | number | boolean | undefined {
  for (const tag of ['Text', 'Date', 'DateTime', 'Time', 'Choice', 'Barcode'] as const) {
    if (tag in value && typeof value[tag] === 'string') return value[tag] as string;
  }
  for (const tag of ['Integer', 'Decimal'] as const) {
    if (tag in value && typeof value[tag] === 'number') return value[tag] as number;
  }
  if ('Boolean' in value && typeof value.Boolean === 'boolean') return value.Boolean;
  if ('MultiChoice' in value && Array.isArray(value.MultiChoice)) {
    return value.MultiChoice.filter((c): c is string => typeof c === 'string').join(', ');
  }
  return undefined;
}

interface RawSubmission {
  id?: unknown;
  values?: unknown;
  completed_at?: unknown;
  device_location?: unknown;
  collector_id?: unknown;
  status?: unknown;
  attachments?: unknown;
}

function parseAttachments(raw: unknown): CollectaAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const a = entry as Record<string, unknown> | null;
    if (!a || typeof a.id !== 'string') return [];
    return [
      {
        id: a.id,
        fieldName: typeof a.field_name === 'string' ? a.field_name : '',
        filename: typeof a.filename === 'string' ? a.filename : a.id,
        mimeType: typeof a.mime_type === 'string' ? a.mime_type : '',
      },
    ];
  });
}

/**
 * Submissions as a FeatureCollection: geometry from the first geo field in the
 * form's own field order (a JSON object gives the values no order of its own),
 * falling back to the device location; scalar values become properties. A
 * submission with no location still comes back in `submissions`, marked, so
 * the panel can say what the layer does not show.
 */
export function submissionsToGeoJson(
  geoFieldOrder: string[],
  body: unknown,
): SubmissionLayer {
  const features: GeoJSON.Feature[] = [];
  const submissions: SubmissionInfo[] = [];
  for (const raw of Array.isArray(body) ? body : []) {
    const s = raw as RawSubmission | null;
    if (!s || typeof s.id !== 'string') continue;
    const values =
      s.values && typeof s.values === 'object' ? (s.values as Record<string, TaggedValue>) : {};

    let geometry: GeoJSON.Geometry | null = null;
    for (const name of geoFieldOrder) {
      geometry = values[name] ? valueGeometry(values[name]) : null;
      if (geometry) break;
    }
    if (!geometry) {
      const device = position(s.device_location);
      if (device) geometry = { type: 'Point', coordinates: device };
    }

    const info: SubmissionInfo = {
      id: s.id,
      completedAt: typeof s.completed_at === 'string' ? s.completed_at : null,
      collectorId: typeof s.collector_id === 'string' ? s.collector_id : null,
      attachments: parseAttachments(s.attachments),
      located: geometry !== null,
    };
    submissions.push(info);
    if (!geometry) continue;

    const properties: GeoJSON.GeoJsonProperties = { submission_id: s.id };
    if (typeof s.status === 'string') properties.status = s.status;
    if (info.completedAt) properties.completed_at = info.completedAt;
    if (info.collectorId) properties.collector = info.collectorId;
    for (const [name, value] of Object.entries(values)) {
      const cell = valueProperty(value);
      if (cell !== undefined) properties[name] = cell;
    }
    features.push({ type: 'Feature', geometry, properties });
  }
  return { geojson: { type: 'FeatureCollection', features }, submissions };
}

/** The form's geo-typed field names, in the form's own field order. */
function geoFieldOrder(form: unknown): string[] {
  const fields = (form as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((raw) => {
    const f = raw as { name?: unknown; field_type?: unknown } | null;
    const spatial =
      f?.field_type === 'GeoPoint' || f?.field_type === 'GeoTrace' || f?.field_type === 'GeoShape';
    return spatial && typeof f?.name === 'string' ? [f.name] : [];
  });
}

export async function loadSubmissions(formId: string): Promise<SubmissionLayer> {
  const id = encodeURIComponent(formId);
  const [form, submissions] = await Promise.all([
    request(`${API}/forms/${id}`).then((res) => res.json()),
    request(`${API}/forms/${id}/submissions`).then((res) => res.json()),
  ]);
  return submissionsToGeoJson(geoFieldOrder(form), submissions);
}

/** What collecta wrote into ptolemy for one form, and where it put it. */
export interface PublishResult {
  datasetId: string;
  branchId: string;
  published: number;
  skipped: number;
  totalPublished: number;
}

const UNREADABLE_PUBLISH = 'The publish reply named no dataset branch.';

function count(raw: unknown): number {
  return typeof raw === 'number' ? raw : 0;
}

/**
 * Copy the form's submissions into a ptolemy dataset. Repeat calls publish only
 * what is new, so `skipped` counts the submissions already there.
 */
export async function publishForm(formId: string): Promise<PublishResult> {
  const res = await request(`${API}/forms/${encodeURIComponent(formId)}/publish`, {
    method: 'POST',
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.dataset_id !== 'string' || typeof body.branch_id !== 'string') {
    throw new CollectaError(res.status, UNREADABLE_PUBLISH);
  }
  return {
    datasetId: body.dataset_id,
    branchId: body.branch_id,
    published: count(body.published),
    skipped: count(body.skipped),
    totalPublished: count(body.total_published),
  };
}
