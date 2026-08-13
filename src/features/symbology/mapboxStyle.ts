/**
 * Mapbox GL style JSON as an exchange format for symbology: the class colours
 * become a data-driven paint expression, and an imported style's match, step,
 * case or interpolate expression comes back as the matching renderer. A style
 * says nothing about a break method, and nothing it drops is silent: it arrives
 * in `unsupported` the way an SLD conversion reports its own.
 *
 * This is the one exchange that carries an expression renderer whole: the
 * arithmetic nests inside an interpolate, and the ramp is read back off the
 * stop colours.
 */
import type { ColorRamp } from '../../raster/types';
import { DEFAULT_LAYER_COLOR, type AgentLayer } from '../../store/agentLayers';
import {
  formatExpression,
  parseExpression,
  type BinaryOperator,
  type ExpressionNode,
} from './expression';
import { unsupportedNote, type UnsupportedConstruct } from './sldConversion';
import {
  EXPRESSION_STOPS,
  RULE_OPS,
  geometryKinds,
  rampColor,
  rampOfSamples,
  spanAt,
  type BreakMethod,
  type ExpressionSymbology,
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
export const ASSUMED_RAMP: ColorRamp = 'viridis';

const LAYER_BY_KIND: Record<GeometryKind, { type: string; colorKey: string }> = {
  point: { type: 'circle', colorKey: 'circle-color' },
  line: { type: 'line', colorKey: 'line-color' },
  polygon: { type: 'fill', colorKey: 'fill-color' },
};

const COLOR_PAINT_KEYS = ['fill-color', 'line-color', 'circle-color'];
const RADIUS_PAINT_KEY = 'circle-radius';

const BINARY_OPERATORS: BinaryOperator[] = ['+', '-', '*', '/'];

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

function toMapboxExpression(node: ExpressionNode): unknown {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'field':
      return ['get', node.name];
    case 'binary':
      return [node.operator, toMapboxExpression(node.left), toMapboxExpression(node.right)];
  }
}

const stopPositions = () =>
  Array.from({ length: EXPRESSION_STOPS }, (_, index) => index / (EXPRESSION_STOPS - 1));

/**
 * The ramp or the size span as an interpolate over the expression. Null when
 * the expression is malformed, which only a hand-edited project file holds.
 */
function interpolated(sym: ExpressionSymbology, at: (position: number) => unknown): unknown[] | null {
  const { node } = parseExpression(sym.expression);
  if (!node) return null;
  const [low, high] = sym.domain;
  const stops = stopPositions().flatMap((position) => [low + position * (high - low), at(position)]);
  return ['interpolate', ['linear'], toMapboxExpression(node), ...stops];
}

function paintColor(sym: Symbology, fallback: string): unknown {
  switch (sym.kind) {
    case 'expression':
      return interpolated(sym, (position) => rampColor(sym.ramp, position)) ?? fallback;
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
  const sizes = sym.kind === 'expression' ? sym.sizes : undefined;
  const radius =
    sym.kind === 'expression' && sizes
      ? interpolated(sym, (position) => spanAt(sizes, position))
      : null;
  const layers = geometryKinds(layer.sourceGeojson ?? layer.geojson).map((kind) => {
    const spec = LAYER_BY_KIND[kind];
    return {
      id: `${layer.id}-${spec.type}`,
      type: spec.type,
      source: PLACEHOLDER_SOURCE,
      paint: {
        [spec.colorKey]: color,
        ...(kind === 'point' && radius ? { [RADIUS_PAINT_KEY]: radius } : {}),
      },
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
          unsupportedNote(
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
    unsupportedNote(
      'step',
      `a style states no break method or colour ramp, so method ${ASSUMED_BREAK_METHOD} and ramp ${ASSUMED_RAMP} are placeholders; the listed colours are what render`,
    ),
  ];
  if (typeof base === 'string') {
    unsupported.push(
      unsupportedNote(
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
      unsupportedNote(
        conditionName(body[index]),
        'rule dropped: a symbology rule tests one property against one literal',
        index / 2,
      ),
    );
  }
  if (!rules.length) return null;

  if (typeof fallback === 'string') {
    unsupported.push(
      unsupportedNote(
        'case',
        `the fallback colour ${fallback} is dropped: a feature no rule matches keeps the layer colour`,
      ),
    );
  }
  return { symbology: { kind: 'rules', rules }, unsupported };
}

/** A style expression back as one of ours, where every part of it is arithmetic. */
function fromMapboxExpression(value: unknown): ExpressionNode | null {
  if (isFiniteNumber(value)) return { kind: 'number', value };
  const field = propertyName(value);
  if (field) return { kind: 'field', name: field };
  if (!Array.isArray(value) || value.length !== 3) return null;
  const operator = BINARY_OPERATORS.find((known) => known === value[0]);
  if (!operator) return null;
  const left = fromMapboxExpression(value[1]);
  const right = fromMapboxExpression(value[2]);
  return left && right ? { kind: 'binary', operator, left, right } : null;
}

/** An interpolate's stop inputs and outputs, where they are evenly spaced. */
function interpolateStops(body: unknown[]): { inputs: number[]; outputs: unknown[] } | null {
  if (body.length < 4 || body.length % 2 !== 0) return null;
  const inputs: number[] = [];
  const outputs: unknown[] = [];
  for (let index = 0; index < body.length; index += 2) {
    const input = body[index];
    if (!isFiniteNumber(input)) return null;
    inputs.push(input);
    outputs.push(body[index + 1]);
  }
  return inputs[inputs.length - 1] > inputs[0] ? { inputs, outputs } : null;
}

function fromInterpolate(expression: unknown[]): Converted | null {
  const interpolation = expression[1];
  if (!Array.isArray(interpolation) || interpolation[0] !== 'linear') return null;
  const node = fromMapboxExpression(expression[2]);
  if (!node) return null;
  const stops = interpolateStops(expression.slice(3));
  if (!stops) return null;

  const ramp = rampOfSamples(stops.outputs.filter((color) => typeof color === 'string'));
  const domain: [number, number] = [stops.inputs[0], stops.inputs[stops.inputs.length - 1]];
  const unsupported = ramp
    ? []
    : [
        unsupportedNote(
          'interpolate',
          `those stop colours are no ramp this viewer holds, so ramp ${ASSUMED_RAMP} stands in and the layer draws in that instead`,
        ),
      ];
  return {
    symbology: { kind: 'expression', expression: formatExpression(node), ramp: ramp ?? ASSUMED_RAMP, domain },
    unsupported,
  };
}

/**
 * A circle-radius anywhere in the style. The sizes ride on the point layer,
 * which is not the layer the colour came from when the style holds both.
 */
function radiusPaint(layers: unknown[]): unknown {
  for (const styleLayer of layers) {
    if (!isRecord(styleLayer) || !isRecord(styleLayer.paint)) continue;
    const radius = styleLayer.paint[RADIUS_PAINT_KEY];
    if (radius !== undefined) return radius;
  }
  return undefined;
}

/** The same renderer sizing its points too, where a circle-radius says so. */
function withSizes(sym: ExpressionSymbology, radius: unknown): ExpressionSymbology {
  if (!Array.isArray(radius) || radius[0] !== 'interpolate') return sym;
  const node = fromMapboxExpression(radius[2]);
  if (!node || formatExpression(node) !== sym.expression) return sym;
  const stops = interpolateStops(radius.slice(3));
  const low = stops?.outputs[0];
  const high = stops?.outputs[stops.outputs.length - 1];
  if (!isFiniteNumber(low) || !isFiniteNumber(high)) return sym;
  return { ...sym, sizes: [low, high] };
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
    case 'interpolate':
      return fromInterpolate(value);
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
          unsupportedNote('layers', `the style holds ${layers.length} layers and only ${id} converted`),
        );
      }
      const symbology =
        converted.symbology.kind === 'expression'
          ? withSizes(converted.symbology, radiusPaint(layers))
          : converted.symbology;
      return { layer: id, symbology, unsupported };
    }
  }

  throw new Error(
    'No layer in that style colours features by a match, step, case or interpolate expression, so there is nothing to convert.',
  );
}
