import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../../offline/backends';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from '../elements/elementService';

const UNAUTHORIZED = 401;
// tiletopia's require_editor answers a viewer-role token with an empty 403
const FORBIDDEN = 403;
const NO_RESPONSE = 0;
const SIGN_IN_MESSAGE = 'Sign in to use the issues, versions and IDS checks of this model.';
const ROLE_REFUSAL_MESSAGE = 'Your role cannot make this change. It needs the editor or admin role.';
const POLL_MILLISECONDS = 2000;
// tiletopia refuses a larger page
const LARGEST_VERSION_PAGE = 1000;

export type BcfVector = [number, number, number];

export interface BcfComponent {
  ifcGuid: string | null;
  originatingSystem: string | null;
  authoringToolId: string | null;
}

interface BcfCameraPose {
  cameraViewPoint: BcfVector;
  cameraDirection: BcfVector;
  cameraUpVector: BcfVector;
  aspectRatio: number;
}

export type BcfCamera =
  | (BcfCameraPose & { kind: 'perspective'; fieldOfView: number })
  | (BcfCameraPose & { kind: 'orthogonal'; viewToWorldScale: number });

export interface BcfVisibility {
  defaultVisibility: boolean;
  spacesVisible: boolean;
  spaceBoundariesVisible: boolean;
  openingsVisible: boolean;
  exceptions: BcfComponent[];
}

export interface BcfClippingPlane {
  location: BcfVector;
  direction: BcfVector;
}

export interface BcfViewpoint {
  guid: string;
  index: number | null;
  snapshotFormat: 'png' | 'jpg' | null;
  camera: BcfCamera | null;
  selection: BcfComponent[];
  visibility: BcfVisibility | null;
  coloring: { color: string; components: BcfComponent[] }[];
  lines: { startPoint: BcfVector; endPoint: BcfVector }[];
  clippingPlanes: BcfClippingPlane[];
}

export interface BcfComment {
  guid: string;
  date: string;
  author: string;
  comment: string | null;
  viewpointGuid: string | null;
  modifiedDate: string | null;
  modifiedAuthor: string | null;
}

export interface BcfTopicSummary {
  guid: string;
  serverAssignedId: string | null;
  title: string;
  topicType: string;
  topicStatus: string;
  priority: string | null;
  labels: string[];
  assignedTo: string | null;
  dueDate: string | null;
  creationDate: string;
  creationAuthor: string;
  commentCount: number;
  viewpointCount: number;
}

export interface BcfFile {
  ifcProject: string | null;
  ifcSpatialStructureElement: string | null;
  isExternal: boolean;
  filename: string | null;
  date: string | null;
  reference: string | null;
}

export interface BcfTopic extends Omit<BcfTopicSummary, 'commentCount' | 'viewpointCount'> {
  referenceLinks: string[];
  index: number | null;
  modifiedDate: string | null;
  modifiedAuthor: string | null;
  stage: string | null;
  description: string | null;
  externalBimSnippet: { snippetType: string; reference: string; referenceSchema: string } | null;
  externalDocuments: { guid: string; url: string; description: string | null }[];
  relatedTopics: string[];
  files: BcfFile[];
  comments: BcfComment[];
  viewpoints: BcfViewpoint[];
}

export interface BcfTopicPage {
  items: BcfTopicSummary[];
  total: number;
  continuationToken?: string;
}

export interface BcfImportReport {
  topics: number;
  created: number;
  updated: number;
  comments: number;
  viewpoints: number;
  snapshots: number;
  elementReferences: { total: number; distinctIds: number; unknownIds: number; withoutIfcGuid: number };
  dropped: Record<string, number>;
}

export type ModelVersionStatus = 'uploading' | 'tiling' | 'ready' | 'error';

export interface ModelVersion {
  assetId: number;
  creationTimestamp: string;
  id: string;
  baseAssetId: string;
  versionNumber: number;
  name: string;
  status: ModelVersionStatus;
  hasElementStore: boolean;
}

export type ChangeReportStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ERROR';

export interface ChangeReport {
  id: string;
  status: ChangeReportStatus;
  dateAdded: string;
  fromAssetId: string;
  toAssetId: string;
  summary: { added: number; removed: number; changed: number; unchanged: number };
  error: string | null;
}

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface ElementChange {
  kind: ChangeKind;
  id: string;
  label: string | null;
  ifcClass: string;
  changedKeys: string[];
  geometryChanged: boolean;
  locationChanged: boolean;
}

export interface ElementChangePage {
  items: ElementChange[];
  continuationToken?: string;
}

export interface IdsFailedElement {
  reason: string;
  class: string;
  name: string | null;
  id: number;
  global_id: string | null;
}

export interface IdsRequirementResult {
  description: string;
  status: boolean | null;
  failed_entities: IdsFailedElement[];
  total_applicable: number;
  total_pass: number;
  total_fail: number;
}

export interface IdsSpecificationResult {
  name: string;
  description: string | null;
  // ifctester leaves status null on a specification it skipped for naming another IFC version
  status: boolean | null;
  total_applicable: number;
  total_applicable_pass: number;
  total_applicable_fail: number;
  requirements: IdsRequirementResult[];
}

export interface IdsReport {
  title: string;
  status: boolean;
  total_specifications: number;
  total_specifications_pass: number;
  total_checks: number;
  total_checks_pass: number;
  specifications: IdsSpecificationResult[];
}

export type IdsCheckStatus = 'running' | 'done' | 'failed';

export interface IdsCheck {
  idsFileName: string;
  status: IdsCheckStatus;
  checkedAt: string | null;
  error: string | null;
  report: IdsReport | null;
}

export interface DownloadedFile {
  name: string;
  blob: Blob;
}

async function tiletopiaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, UNAUTHORIZED, null);
  const headers = new Headers(init.headers);
  // tiletopia reads the token from this header only, never the query string
  for (const [name, value] of Object.entries(authHeaders())) headers.set(name, value);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (failure) {
    // fetch rejects with a TypeError when no response arrives
    if (failure instanceof TypeError) {
      throw new ElementApiError(unreachableMessage('tiletopia', NO_RESPONSE), NO_RESPONSE, null);
    }
    throw failure;
  }
  noticeRefusal(response.status);
  if (response.ok) return response;
  const { status } = response;
  if (status === UNAUTHORIZED) throw new ElementApiError(SIGN_IN_MESSAGE, status, null);
  if (status === FORBIDDEN) throw new ElementApiError(ROLE_REFUSAL_MESSAGE, status, null);
  const text = await response.text();
  const body = errorBodyOf(text);
  // nginx answers 502, 503 and 504 with an html page, tiletopia answers its own 503 with a json message
  if (isUnreachableStatus(status) && !body?.message) {
    throw new ElementApiError(unreachableMessage('tiletopia', status), status, null);
  }
  // the asset upload route answers its refusals as plain text
  const message = body?.message ?? (text.trim() || `tiletopia answered HTTP ${status}.`);
  throw new ElementApiError(message, status, body?.code ?? null);
}

async function tiletopiaJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await tiletopiaFetch(path, init)).json()) as T;
}

function assetPath(assetId: string, rest: string): string {
  return `/v1/assets/${encodeURIComponent(assetId)}/${rest}`;
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) parameters.set(name, String(value));
  }
  const text = parameters.toString();
  return text === '' ? path : `${path}?${text}`;
}

function jsonBody(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function downloaded(response: Response, fallbackName: string): Promise<DownloadedFile> {
  const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  return { name, blob: await response.blob() };
}

export function importBcf(assetId: string, file: File): Promise<BcfImportReport> {
  const form = new FormData();
  form.append('file', file);
  return tiletopiaJson(assetPath(assetId, 'bcf/import'), { method: 'POST', body: form });
}

export async function exportBcf(assetId: string): Promise<DownloadedFile> {
  return downloaded(await tiletopiaFetch(assetPath(assetId, 'bcf/export')), `model-${assetId}.bcf`);
}

export function listBcfTopics(assetId: string, continuationToken?: string): Promise<BcfTopicPage> {
  return tiletopiaJson(withQuery(assetPath(assetId, 'bcf/topics'), { continuationToken }));
}

function topicPath(assetId: string, guid: string): string {
  return assetPath(assetId, `bcf/topics/${encodeURIComponent(guid)}`);
}

export function readBcfTopic(assetId: string, guid: string): Promise<BcfTopic> {
  return tiletopiaJson(topicPath(assetId, guid));
}

export function saveBcfTopic(assetId: string, topic: BcfTopic): Promise<BcfTopic> {
  return tiletopiaJson(topicPath(assetId, topic.guid), jsonBody('PUT', topic));
}

export async function deleteBcfTopic(assetId: string, guid: string): Promise<void> {
  await tiletopiaFetch(topicPath(assetId, guid), { method: 'DELETE' });
}

export async function readViewpointSnapshot(assetId: string, topicGuid: string, viewpointGuid: string): Promise<Blob> {
  const path = `${topicPath(assetId, topicGuid)}/viewpoints/${encodeURIComponent(viewpointGuid)}/snapshot`;
  return (await tiletopiaFetch(path)).blob();
}

export async function listModelVersions(assetId: string): Promise<ModelVersion[]> {
  const page = await tiletopiaJson<{ items: ModelVersion[]; total: number }>(
    withQuery(assetPath(assetId, 'tileset-revisions'), { limit: LARGEST_VERSION_PAGE }),
  );
  return page.items;
}

export function uploadModelVersion(
  baseAssetId: string,
  file: File,
  idsFile?: File | null,
): Promise<{ id: string; name: string }> {
  const form = new FormData();
  form.append('name', file.name);
  form.append('base_asset_id', baseAssetId);
  form.append('file', file);
  if (idsFile) form.append('ids', idsFile);
  // nginx rewrites /tiles/ to tiletopia's /api/, where POST /api/v1/assets takes base_asset_id
  return tiletopiaJson('/tiles/v1/assets', { method: 'POST', body: form });
}

export async function compareVersions(fromAssetId: string, toAssetId: string): Promise<ChangeReport> {
  try {
    return await tiletopiaJson<ChangeReport>('/v1/assets/compare', jsonBody('POST', { fromAssetId, toAssetId }));
  } catch (failure) {
    if (!(failure instanceof ElementApiError) || failure.code !== 'REPORT_EXISTS') throw failure;
  }
  const { items } = await tiletopiaJson<{ items: ChangeReport[] }>(assetPath(toAssetId, 'change-reports'));
  const existing = items.find((report) => report.fromAssetId === fromAssetId && report.toAssetId === toAssetId);
  if (!existing) throw new Error('tiletopia has a change report for these versions but did not list it.');
  return existing;
}

function readChangeReport(reportId: string, signal: AbortSignal): Promise<ChangeReport> {
  return tiletopiaJson(`/v1/change-reports/${encodeURIComponent(reportId)}`, { signal });
}

interface PollOptions<T> {
  onUpdate: (value: T) => void;
  signal: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
}

async function pollUntilFinished<T>(
  read: (signal: AbortSignal) => Promise<T>,
  isFinished: (value: T) => boolean,
  {
    onUpdate,
    signal,
    wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
  }: PollOptions<T>,
): Promise<T> {
  for (;;) {
    const value = await read(signal);
    onUpdate(value);
    if (isFinished(value)) return value;
    await wait(POLL_MILLISECONDS);
  }
}

export function pollChangeReport(reportId: string, options: PollOptions<ChangeReport>): Promise<ChangeReport> {
  return pollUntilFinished(
    (signal) => readChangeReport(reportId, signal),
    (report) => report.status === 'COMPLETE' || report.status === 'ERROR',
    options,
  );
}

export function listElementChanges(
  reportId: string,
  { kind, continuationToken }: { kind?: ChangeKind; continuationToken?: string },
): Promise<ElementChangePage> {
  return tiletopiaJson(
    withQuery(`/v1/change-reports/${encodeURIComponent(reportId)}/changes`, { kind, continuationToken }),
  );
}

export async function startIdsCheck(assetId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await tiletopiaFetch(assetPath(assetId, 'ids'), { method: 'POST', body: form });
}

export async function readLatestIdsCheck(assetId: string): Promise<IdsCheck | null> {
  try {
    return await tiletopiaJson<IdsCheck>(assetPath(assetId, 'ids'));
  } catch (failure) {
    if (failure instanceof ElementApiError && failure.code === 'IDS_NOT_CHECKED') return null;
    throw failure;
  }
}

export function pollIdsCheck(assetId: string, options: PollOptions<IdsCheck>): Promise<IdsCheck> {
  return pollUntilFinished(
    (signal) => tiletopiaJson<IdsCheck>(assetPath(assetId, 'ids'), { signal }),
    (check) => check.status !== 'running',
    options,
  );
}

export async function exportDxf(assetId: string, cutHeight?: number): Promise<DownloadedFile> {
  const response = await tiletopiaFetch(withQuery(assetPath(assetId, 'dxf'), { cutHeight }));
  return downloaded(response, `model-${assetId}.dxf`);
}

export function saveDownloadedFile({ name, blob }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
