/**
 * Mapbox GL style JSON as an exchange format for symbology: the class colours
 * become a data-driven paint expression, and an imported style's match, step or
 * case expression comes back as the matching renderer. A style says nothing
 * about a break method or a colour ramp, and nothing it drops is silent: it
 * arrives in `unsupported` the way an SLD conversion reports its own.
 */
import type { ColorRamp } from '../../raster/types';
import { DEFAULT_LAYER_COLOR, type AgentLayer } from '../../store/agentLayers';
import type { UnsupportedConstruct } from './sldConversion';
import {
  RULE_OPS,
  geometryKinds,
  type BreakMethod,
  type GeometryKind,
  type RuleOp,
  type Symbology,
  type SymbologyRule,
} from './symbology';

const STYLE_SPEC_VERSION = 8;
const PLACEHOLDER_SOURCE = 'symbology-source';
const PLACEHOLDER_DATA_URL = 'https://example.com/replace-with-your-data.geojson';

/** What a style states nowhere, so an imported graduated renderer assumes it. */
const ASSUMED_BREAK_METHOD: BreakMethod = 'equal';
const ASSUMED_RAMP: ColorRamp = 'viridis';

const LAYER_BY_KIND: Record<GeometryKind, { type: string; colorKey: string }> = {
  point: { type: 'circle', colorKey: 'circle-color' },
  line: { type: 'line', colorKey: 'line-color' },
  polygon: { type: 'fill', colorKey: 'fill-color' },
};

const COLOR_PAINT_KEYS = ['fill-color', 'line-color', 'circle-color'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRuleOp = (value: unknown): value is RuleOp => RULE_OPS.some((op) => op === value);

/** A rule value is text in the editor; a style reads a number as a number. */
function literal(value: string): string | number {
  const asNumber = Number(value);
  return value.trim() !== '' && Number.isFinite(asNumber) ? asNumber : value;
}

function paintColor(sym: Symbology, fallback: string): unknown[] {
  switch (sym.kind) {
    case 'categorized':
      return [
        'match',
        ['get', sym.field],
        ...sym.categories.flatMap((category) => [category.value, category.color]),
        fallback,
      ];
    case 'graduated':
      return [
        'step',
        ['get', sym.field],
        fallback,
        ...sym.breaks.flatMap((lower, index) => [lower, sym.colors[index]]),
      ];
    case 'rules':
      return [
        'case',
        ...sym.rules.flatMap((rule) => [
          [rule.op, ['get', rule.field], literal(rule.value)],
          rule.color,
        ]),
        fallback,
      ];
  }
}

/** The layer's symbology as a style document, or null when it has none. */
export function symbologyToMapboxStyle(layer: AgentLayer): string | null {
  const sym = layer.symbology;
  if (!sym) return null;
  const color = paintColor(sym, layer.color ?? DEFAULT_LAYER_COLOR);
  const layers = geometryKinds(layer.sourceGeojson ?? layer.geojson).map((kind) => {
    const spec = LAYER_BY_KIND[kind];
    return {
      id: `${layer.id}-${spec.type}`,
      type: spec.type,
      source: PLACEHOLDER_SOURCE,
      paint: { [spec.colorKey]: color },
    };
  });

  return `${JSON.stringify(
    {
      version: STYLE_SPEC_VERSION,
      name: layer.name,
      sources: {
        [PLACEHOLDER_SOURCE]: { type: 'geojson', data: PLACEHOLDER_DATA_URL },
      },
      layers,
    },
    null,
    2,
  )}\n`;
}

export interface MapboxStyleConversion {
  /** The style layer the symbology came from, for labelling. */
  layer: string;
  symbology: Symbology;
  unsupported: UnsupportedConstruct[];
}

interface Converted {
  symbology: Symbology;
  unsupported: UnsupportedConstruct[];
}

const note = (
  construct: string,
  detail: string,
  ruleIndex: number | null = null,
): UnsupportedConstruct => ({
  construct,
  rule_index: ruleIndex,
  rule_name: null,
  detail,
});

/** The property an expression reads, when that is all it does. */
function propertyName(expression: unknown): string | null {
  if (!Array.isArray(expression) || expression[0] !== 'get') return null;
  return typeof expression[1] === 'string' ? expression[1] : null;
}

/** The trailing colour a match or case falls back to, where it has one. */
function takeFallback(body: unknown[]): unknown {
  return body.length % 2 === 1 ? body.pop() : undefined;
}

function fromMatch(expression: unknown[]): Converted | null {
  const field = propertyName(expression[1]);
  if (!field) return null;
  const body = expression.slice(2);
  const fallback = takeFallback(body);

  const categories: { value: string | number; color: string }[] = [];
  for (let index = 0; index + 1 < body.length; index += 2) {
    const color = body[index + 1];
    if (typeof color !== 'string') return null;
    const label = body[index];
    const labels: unknown[] = Array.isArray(label) ? label : [label];
    for (const value of labels) {
      if (typeof value !== 'string' && !isFiniteNumber(value)) return null;
      categories.push({ value, color });
    }
  }
  if (!categories.length) return null;

  const unsupported =
    typeof fallback === 'string'
      ? [
          note(
            'match',
            `the fallback colour ${fallback} is dropped: a feature no category matches keeps the layer colour`,
          ),
        ]
      : [];
  return { symbology: { kind: 'categorized', field, categories }, unsupported };
}

function fromStep(expression: unknown[]): Converted | null {
  const field = propertyName(expression[1]);
  if (!field) return null;
  const base = expression[2];
  const body = expression.slice(3);
  if (!body.length || body.length % 2 !== 0) return null;

  const breaks: number[] = [];
  const colors: string[] = [];
  for (let index = 0; index < body.length; index += 2) {
    const lower = body[index];
    const color = body[index + 1];
    if (!isFiniteNumber(lower) || typeof color !== 'string') return null;
    breaks.push(lower);
    colors.push(color);
  }

  const unsupported = [
    note(
      'step',
      `a style states no break method or colour ramp, so method ${ASSUMED_BREAK_METHOD} and ramp ${ASSUMED_RAMP} are placeholders; the listed colours are what render`,
    ),
  ];
  if (typeof base === 'string') {
    unsupported.push(
      note(
        'step',
        `the colour ${base} below ${breaks[0]} is dropped: a feature under the first break takes the first class colour`,
      ),
    );
  }
  return {
    symbology: {
      kind: 'graduated',
      field,
      method: ASSUMED_BREAK_METHOD,
      ramp: ASSUMED_RAMP,
      breaks,
      colors,
    },
    unsupported,
  };
}

function caseRule(condition: unknown, color: unknown): SymbologyRule | null {
  if (typeof color !== 'string') return null;
  if (!Array.isArray(condition) || condition.length !== 3) return null;
  const [op, target, value] = condition;
  if (!isRuleOp(op)) return null;
  const field = propertyName(target);
  if (!field) return null;
  if (typeof value !== 'string' && !isFiniteNumber(value)) return null;
  return { field, op, value: String(value), color };
}

/** What a condition this shape cannot carry calls itself, for the report. */
function conditionName(condition: unknown): string {
  if (Array.isArray(condition) && typeof condition[0] === 'string') return condition[0];
  return 'case';
}

function fromCase(expression: unknown[]): Converted | null {
  const body = expression.slice(1);
  const fallback = takeFallback(body);

  const rules: SymbologyRule[] = [];
  const unsupported: UnsupportedConstruct[] = [];
  for (let index = 0; index + 1 < body.length; index += 2) {
    const rule = caseRule(body[index], body[index + 1]);
    if (rule) {
      rules.push(rule);
      continue;
    }
    unsupported.push(
      note(
        conditionName(body[index]),
        'rule dropped: a symbology rule tests one property against one literal',
        index / 2,
      ),
    );
  }
  if (!rules.length) return null;

  if (typeof fallback === 'string') {
    unsupported.push(
      note(
        'case',
        `the fallback colour ${fallback} is dropped: a feature no rule matches keeps the layer colour`,
      ),
    );
  }
  return { symbology: { kind: 'rules', rules }, unsupported };
}

function fromPaintColor(value: unknown): Converted | null {
  if (!Array.isArray(value)) return null;
  switch (value[0]) {
    case 'match':
      return fromMatch(value);
    case 'step':
      return fromStep(value);
    case 'case':
      return fromCase(value);
    default:
      return null;
  }
}

function parseStyle(text: string): Record<string, unknown> {
  let style: unknown;
  try {
    style = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Mapbox style: it does not hold valid JSON.');
  }
  if (!isRecord(style)) throw new Error('That file is not a Mapbox style: it holds no style object.');
  return style;
}

/**
 * The first layer in a style whose colour classifies features, as symbology.
 * Throws when the style holds nothing this viewer can classify by.
 */
export function mapboxStyleToSymbology(text: string): MapboxStyleConversion {
  const style = parseStyle(text);
  const layers = Array.isArray(style.layers) ? style.layers : [];
  if (!layers.length) throw new Error('That style has no layers.');

  for (const styleLayer of layers) {
    if (!isRecord(styleLayer) || !isRecord(styleLayer.paint)) continue;
    for (const key of COLOR_PAINT_KEYS) {
      const converted = fromPaintColor(styleLayer.paint[key]);
      if (!converted) continue;
      const id = typeof styleLayer.id === 'string' ? styleLayer.id : key;
      const unsupported = [...converted.unsupported];
      if (layers.length > 1) {
        unsupported.unshift(
          note('layers', `the style holds ${layers.length} layers and only ${id} converted`),
        );
      }
      return { layer: id, symbology: converted.symbology, unsupported };
    }
  }

  throw new Error(
    'No layer in that style colours features by a match, step or case expression, so there is nothing to convert.',
  );
}
