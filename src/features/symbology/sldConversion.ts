/**
 * Client for fenestra's SLD conversion, reached same-origin through the /ogc/
 * proxy (nginx rewrites /ogc/(.*) -> fenestra /$1). The request body is the raw
 * SLD document and fenestra picks the first NamedLayer and UserStyle in it.
 *
 * A symbology carries colour and nothing else, so most of what an SLD says
 * about drawing cannot come across. Whatever was left behind arrives in
 * `unsupported` and the caller has to show it.
 */
import { apiHeaders, noticeRefusal } from '../../lib/apiAuth';
import type { ColorRamp } from '../../raster/types';
import {
  BREAK_METHODS,
  COLOR_RAMPS,
  RULE_OPS,
  type BreakMethod,
  type RuleOp,
  type Symbology,
  type SymbologyRule,
} from './symbology';

const SLD_SYMBOLOGY_URL = '/ogc/sld/symbology';

/** One thing in the SLD the symbology shape could not carry. */
export interface UnsupportedConstruct {
  /** The SLD element it came from, by local name. */
  construct: string;
  rule_index: number | null;
  rule_name: string | null;
  detail: string;
}

export interface SldConversion {
  layer: string;
  style: string | null;
  /** Null when nothing in the style classifies features by a property. */
  symbology: Symbology | null;
  unsupported: UnsupportedConstruct[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isBreakMethod = (value: unknown): value is BreakMethod =>
  BREAK_METHODS.some((method) => method === value);

const isColorRamp = (value: unknown): value is ColorRamp =>
  COLOR_RAMPS.some((ramp) => ramp === value);

const isRuleOp = (value: unknown): value is RuleOp => RULE_OPS.some((op) => op === value);

function isArrayOf<T>(value: unknown, item: (v: unknown) => v is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

function parseCategory(value: unknown): { value: string | number; color: string } | null {
  if (!isRecord(value) || !isString(value.color)) return null;
  if (!isString(value.value) && !isNumber(value.value)) return null;
  return { value: value.value, color: value.color };
}

function parseRule(value: unknown): SymbologyRule | null {
  if (!isRecord(value)) return null;
  const { field, op, color } = value;
  if (!isString(field) || !isRuleOp(op) || !isString(value.value) || !isString(color)) return null;
  return { field, op, value: value.value, color };
}

function mapAll<T>(value: unknown, parse: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parse);
  return parsed.every((entry) => entry !== null) ? parsed : null;
}

function parseSymbology(value: unknown): Symbology | null {
  if (!isRecord(value)) return null;
  const { field } = value;
  switch (value.kind) {
    case 'graduated': {
      const { method, ramp, breaks, colors } = value;
      if (!isString(field) || !isBreakMethod(method) || !isColorRamp(ramp)) return null;
      if (!isArrayOf(breaks, isNumber) || !isArrayOf(colors, isString)) return null;
      if (breaks.length === 0 || colors.length < breaks.length) return null;
      return { kind: 'graduated', field, method, ramp, breaks, colors };
    }
    case 'categorized': {
      const categories = mapAll(value.categories, parseCategory);
      if (!isString(field) || !categories?.length) return null;
      return { kind: 'categorized', field, categories };
    }
    case 'rules': {
      const rules = mapAll(value.rules, parseRule);
      if (!rules?.length) return null;
      return { kind: 'rules', rules };
    }
    default:
      return null;
  }
}

function parseUnsupported(value: unknown): UnsupportedConstruct[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isString(entry.construct) || !isString(entry.detail)) return [];
    return [
      {
        construct: entry.construct,
        rule_index: isNumber(entry.rule_index) ? entry.rule_index : null,
        rule_name: isString(entry.rule_name) ? entry.rule_name : null,
        detail: entry.detail,
      },
    ];
  });
}

function parseConversion(body: unknown): SldConversion {
  if (!isRecord(body) || !isString(body.layer)) {
    throw new Error('SLD conversion answered something this viewer cannot read');
  }
  const symbology = body.symbology == null ? null : parseSymbology(body.symbology);
  if (body.symbology != null && symbology === null) {
    throw new Error('SLD conversion answered a symbology this viewer cannot read');
  }
  return {
    layer: body.layer,
    style: isString(body.style) ? body.style : null,
    symbology,
    unsupported: parseUnsupported(body.unsupported),
  };
}

/** Convert an SLD document to symbology. Throws with the server's own reason. */
export async function convertSld(xml: string): Promise<SldConversion> {
  const response = await fetch(SLD_SYMBOLOGY_URL, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/xml' }),
    body: xml,
  });
  if (!response.ok) {
    noticeRefusal(response.status);
    const reason = (await response.text()).trim();
    throw new Error(reason || `SLD conversion failed: ${response.status}`);
  }
  return parseConversion(await response.json());
}

/** The layer and style the conversion came from, for labelling. */
export function conversionSource(conversion: SldConversion): string {
  return conversion.style ? `${conversion.layer} / ${conversion.style}` : conversion.layer;
}

/** Which rule an unsupported construct came from, where it came from one. */
export function unsupportedSource(entry: UnsupportedConstruct): string {
  const rule =
    entry.rule_name ?? (entry.rule_index === null ? null : `rule ${entry.rule_index + 1}`);
  return rule ? `${entry.construct} (${rule})` : entry.construct;
}
