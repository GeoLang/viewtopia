// ptolemy serves a dataset's field definitions at /api/v1/datasets/{id}/schema,
// and answers 200 with a body of `null` when the dataset has no schema row. This
// file is the only place that wire shape is written down; `DatasetField` mirrors
// ptolemy's FieldDef key for key.

import { apiHeaders } from './apiAuth';

export type DatasetFieldType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'array'
  | 'object';

export interface DatasetField {
  name: string;
  field_type: DatasetFieldType;
  required: boolean;
  /** ptolemy omits the key when a field has no alias, so it is absent, not null. */
  alias?: string | null;
  allowed_values: unknown[];
  min: number | null;
  max: number | null;
}

const FIELD_TYPES: readonly string[] = [
  'string',
  'integer',
  'float',
  'boolean',
  'array',
  'object',
];

/** The alias a user should read for this field, or the raw column name. */
export function fieldLabel(field: DatasetField): string {
  return field.alias?.trim() || field.name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldType(value: unknown): value is DatasetFieldType {
  return typeof value === 'string' && FIELD_TYPES.includes(value);
}

export function parseDatasetFields(body: unknown): DatasetField[] {
  if (!isRecord(body) || !Array.isArray(body.fields)) return [];
  const fields: DatasetField[] = [];
  for (const raw of body.fields) {
    if (!isRecord(raw)) continue;
    if (typeof raw.name !== 'string' || !raw.name) continue;
    if (!isFieldType(raw.field_type)) continue;
    fields.push({
      name: raw.name,
      field_type: raw.field_type,
      required: raw.required === true,
      alias: typeof raw.alias === 'string' ? raw.alias : null,
      allowed_values: Array.isArray(raw.allowed_values) ? raw.allowed_values : [],
      min: typeof raw.min === 'number' ? raw.min : null,
      max: typeof raw.max === 'number' ? raw.max : null,
    });
  }
  return fields;
}

/** Empty when the dataset has no schema, which is not an error worth surfacing. */
export async function fetchDatasetFields(datasetId: string): Promise<DatasetField[]> {
  const url = `/api/v1/datasets/${encodeURIComponent(datasetId)}/schema`;
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) {
      console.debug(`dataset schema ${datasetId}: ${res.status}, showing column names`);
      return [];
    }
    return parseDatasetFields(await res.json());
  } catch (err) {
    console.debug(`dataset schema ${datasetId} failed, showing column names`, err);
    return [];
  }
}
