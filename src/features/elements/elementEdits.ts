import { apiHeaders, authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from './elementService';

const SIGN_IN_MESSAGE = 'Sign in to browse the elements of this model.';
const ROLE_REFUSAL_MESSAGE = 'Your role cannot make this change. It needs the editor or admin role.';

export type ElementEditRequest =
  | { kind: 'translate'; elementId: string; delta: [number, number, number] }
  | { kind: 'yaw'; elementId: string; radians: number }
  | { kind: 'delete'; elementId: string }
  | { kind: 'add'; origin: [number, number, number]; size: [number, number, number] }
  | { kind: 'replace'; elementId: string; positions: number[]; indices: number[] }
  | { kind: 'relation'; elementId: string; relationId: number; add: boolean };

export interface ElementEditResult {
  elementId: string;
  drawn: boolean;
}

export interface StoredElementEdit {
  elementId: string;
  kind: string;
  hideOriginal: boolean;
  positions: number[];
  indices: number[];
}

export function parseNumbers(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return values;
}

export function parseTriple(text: string): [number, number, number] | null {
  const values = parseNumbers(text) ?? [];
  if (values.length !== 3) return null;
  return [values[0], values[1], values[2]];
}

export function parseMesh(
  positionsText: string,
  indicesText: string,
): { positions: number[]; indices: number[] } | null {
  const positions = parseNumbers(positionsText);
  const indices = parseNumbers(indicesText);
  if (!positions || !indices) return null;
  if (positions.length === 0 || positions.length % 3 !== 0) return null;
  if (indices.length === 0 || indices.length % 3 !== 0) return null;
  const vertices = positions.length / 3;
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices)) return null;
  return { positions, indices };
}

export function editResultMessage(kind: ElementEditRequest['kind'], drawn: boolean, elementId: string): string {
  if (kind === 'delete') return 'Deleted from the IFC. The tiles hide it in this view.';
  if (kind === 'relation') return 'The relation was written. The mesh is unchanged.';
  if (drawn) {
    return `Written into the IFC as ${elementId}. This view draws the new mesh until the asset is tiled again.`;
  }
  return `Written into the IFC as ${elementId}. The tiles still show the previous mesh until the asset is tiled again.`;
}

async function readFailure(response: Response): Promise<never> {
  const text = await response.text();
  const body = errorBodyOf(text);
  if (response.status === 403 && body === null) {
    throw new ElementApiError(ROLE_REFUSAL_MESSAGE, response.status, null);
  }
  throw new ElementApiError(
    body?.message ?? `The element service answered HTTP ${response.status}.`,
    response.status,
    body?.code ?? null,
  );
}

export async function postElementEdit(assetId: string, edit: ElementEditRequest): Promise<ElementEditResult> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, 401, null);
  const response = await fetch(`/v1/assets/${encodeURIComponent(assetId)}/edits`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(edit),
  });
  noticeRefusal(response.status);
  if (!response.ok) await readFailure(response);
  return (await response.json()) as ElementEditResult;
}

export async function fetchElementVolume(assetId: string, elementId: string): Promise<number> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, 401, null);
  const response = await fetch(
    `/v1/assets/${encodeURIComponent(assetId)}/elements/${encodeURIComponent(elementId)}/volume`,
    { headers: authHeaders() },
  );
  noticeRefusal(response.status);
  if (!response.ok) await readFailure(response);
  const body = (await response.json()) as { volume: number };
  return body.volume;
}

export async function fetchElementEdits(assetId: string, signal: AbortSignal): Promise<StoredElementEdit[]> {
  const response = await fetch(`/v1/assets/${encodeURIComponent(assetId)}/element-edits`, {
    headers: authHeaders(),
    signal,
  });
  noticeRefusal(response.status);
  if (!response.ok) await readFailure(response);
  const body = (await response.json()) as { edits?: StoredElementEdit[] };
  return body.edits ?? [];
}
