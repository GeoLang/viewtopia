/**
 * QGIS layer styles (.qml) as an exchange format for symbology: each class
 * becomes one QGIS symbol, and an imported single, categorized, graduated or
 * rule-based renderer comes back as the matching renderer. An expression
 * renderer travels as a graduated one classifying by an expression, which is a
 * thing QGIS writes itself. A symbology carries colour and nothing else, so
 * most of what a QGIS symbol says about drawing cannot come across, and nothing
 * it drops is silent: it arrives in `unsupported` the way an SLD conversion
 * reports its own.
 *
 * The element and attribute names are read off QGIS 3's own writers and off
 * files QGIS 3.22 and 3.28 wrote. Two encodings have to be read that QGIS no
 * longer writes: symbol layer properties as `<prop k v>` rather than an
 * `<Option>` map, and the classification method as `<mode name>` rather than
 * `<classificationMethod id>`.
 */
import {
  ZOOM_LIMITS,
  layerColor,
  layerStyle,
  type AgentLayer,
  type ZoomRange,
} from '../../store/agentLayers';
import { parseExpression } from './expression';
import { ASSUMED_RAMP } from './mapboxStyle';
import { unsupportedNote, type UnsupportedConstruct } from './sldConversion';
import { escapeXml, graduatedBounds } from './sldExport';
import {
  BREAK_METHODS,
  EXPRESSION_STOPS,
  expressionClasses,
  geometryKinds,
  rampOfSamples,
  shortNumber,
  type BreakMethod,
  type GeometryKind,
  type RuleOp,
  type Symbology,
  type SymbologyRule,
} from './symbology';

/** The QGIS release whose element set this writes. */
const QGIS_VERSION = '3.34.0';

/**
 * Scale denominator at web-mercator zoom 0, halving each level: the OGC WMTS
 * GoogleMapsCompatible scale set. QGIS limits a layer by scale where this
 * viewer limits it by zoom, so the two need converting either way.
 */
const SCALE_AT_ZOOM_0 = 559082264.0287178;

/** What QGIS writes for a layer nobody limited by scale. */
const UNLIMITED_MIN_SCALE = '1e+08';

const RENDERER_TYPES = {
  single: 'singleSymbol',
  categorized: 'categorizedSymbol',
  graduated: 'graduatedSymbol',
  rules: 'RuleRenderer',
} as const;

const SYMBOL_BY_KIND: Record<GeometryKind, { type: string; layerClass: string }> = {
  point: { type: 'marker', layerClass: 'SimpleMarker' },
  line: { type: 'line', layerClass: 'SimpleLine' },
  polygon: { type: 'fill', layerClass: 'SimpleFill' },
};

/**
 * Where each symbol layer keeps its main colour, and which of its other keys
 * are worth telling the user were dropped. The rest of a QGIS symbol is units,
 * anchors and map-unit scales that say nothing about how a class reads.
 */
const SYMBOL_LAYER_CLASSES: Record<string, { colorKey: string; dropped: string[] }> = {
  SimpleMarker: {
    colorKey: 'color',
    dropped: ['name', 'size', 'angle', 'outline_color', 'outline_width', 'outline_style'],
  },
  SimpleLine: {
    colorKey: 'line_color',
    dropped: ['line_width', 'line_style', 'customdash', 'capstyle', 'joinstyle'],
  },
  SimpleFill: {
    colorKey: 'color',
    dropped: ['style', 'outline_color', 'outline_width', 'outline_style'],
  },
};

const CLASSIFICATION_IDS: Record<BreakMethod, string> = {
  equal: 'EqualInterval',
  quantile: 'Quantile',
};

/** The pre-3.10 `<mode name>` spelling of the same two methods. */
const LEGACY_MODES: Record<string, BreakMethod> = { equal: 'equal', quantile: 'quantile' };

const EXPRESSION_OPS: Record<RuleOp, string> = {
  '==': '=',
  '!=': '<>',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

/** A filter QGIS wrote, longest operator first so `<=` never reads as `<`. */
const FILTER_PATTERN = /^"?([A-Za-z_][\w ]*)"?\s*(<=|>=|<>|!=|==|=|<|>)\s*(.+)$/;

const OPS_BY_EXPRESSION: Record<string, RuleOp> = {
  '=': '==',
  '==': '==',
  '<>': '!=',
  '!=': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

/** QGIS names the number types whose category values are not text. */
const NUMERIC_VALUE_TYPES = ['double', 'long', 'ulong'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hex = (channel: number) => channel.toString(16).padStart(2, '0');

/**
 * A colour as QGIS encodes one, `R,G,B,A`. A colour this cannot read goes
 * through untouched, because QGIS itself falls back to reading `#rrggbb` and
 * the css colour names.
 */
function toQmlColor(color: string): string {
  const rgb = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return `${rgb[1]},${rgb[2]},${rgb[3]},255`;

  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return color;
  const digits = match[1];
  const wide = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const channels = [0, 2, 4].map((at) => Number.parseInt(wide.slice(at, at + 2), 16));
  return `${channels.join(',')},255`;
}

/**
 * The colour a QGIS symbol draws in, as `#rrggbb`. QGIS 3.40 appends a lossless
 * form to the four channels (`255,0,0,255,rgb:1,0,0,1`), which the leading
 * channels already say in the precision a symbology keeps.
 */
function fromQmlColor(value: string): { color: string; alpha: number } | null {
  const parts = value.split(',');
  if (parts.length < 3) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
      ? { color: value.trim().toLowerCase(), alpha: 255 }
      : null;
  }
  const [red, green, blue] = parts.slice(0, 3).map(Number);
  if (![red, green, blue].every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) return null;
  const alpha = Number(parts[3]);
  return {
    color: `#${hex(red)}${hex(green)}${hex(blue)}`,
    alpha: Number.isInteger(alpha) ? alpha : 255,
  };
}

const scaleDenominator = (zoom: number) => SCALE_AT_ZOOM_0 / 2 ** zoom;

function zoomAtScale(value: string | null, fallback: number): number {
  const denominator = Number(value);
  if (!Number.isFinite(denominator) || denominator <= 0) return fallback;
  return Math.round(Math.log2(SCALE_AT_ZOOM_0 / denominator));
}

// ---------------------------------------------------------------- export

interface QmlClass {
  label: string;
  color: string;
  /** The category value, where the class is one. */
  value?: string | number;
  /** The class bounds, where it has them. */
  bounds?: [number, number];
  /** The QGIS expression the class draws under, where it has one. */
  filter?: string;
}

function expression(field: string, op: RuleOp, value: string): string {
  const asNumber = Number(value);
  const literal =
    value.trim() !== '' && Number.isFinite(asNumber) ? value : `'${value.replace(/'/g, "''")}'`;
  return `"${field}" ${EXPRESSION_OPS[op]} ${literal}`;
}

function classesOf(sym: Symbology, geojson: GeoJSON.FeatureCollection): QmlClass[] {
  switch (sym.kind) {
    case 'expression':
      return expressionClasses(sym).map(({ bounds, color }) => ({
        label: `${shortNumber(bounds[0])} - ${shortNumber(bounds[1])}`,
        color,
        bounds,
      }));
    case 'categorized':
      return sym.categories.map((category) => ({
        label: String(category.value),
        color: category.color,
        value: category.value,
      }));
    case 'graduated': {
      const bounds = graduatedBounds(sym, geojson);
      return sym.breaks.map((_, index) => ({
        label: `${bounds[index]} - ${bounds[index + 1]}`,
        color: sym.colors[index],
        bounds: [bounds[index], bounds[index + 1]],
      }));
    }
    case 'rules':
      return sym.rules.map((rule) => ({
        label: `${rule.field} ${rule.op} ${rule.value}`,
        color: rule.color,
        filter: expression(rule.field, rule.op, rule.value),
      }));
  }
}

function symbolXml(kind: GeometryKind, index: number, color: string): string {
  const spec = SYMBOL_BY_KIND[kind];
  const colorKey = SYMBOL_LAYER_CLASSES[spec.layerClass].colorKey;
  return [
    `      <symbol type="${spec.type}" name="${index}" alpha="1" clip_to_extent="1" force_rhr="0">`,
    `        <layer class="${spec.layerClass}" enabled="1" locked="0" pass="0">`,
    '          <Option type="Map">',
    `            <Option name="${colorKey}" value="${toQmlColor(color)}" type="QString"/>`,
    '          </Option>',
    '        </layer>',
    '      </symbol>',
  ].join('\n');
}

function categoryXml(entry: QmlClass, index: number): string {
  const typed = isFiniteNumber(entry.value) ? ' type="double"' : '';
  return `      <category value="${escapeXml(String(entry.value))}"${typed} symbol="${index}" label="${escapeXml(entry.label)}" render="true"/>`;
}

function rangeXml(entry: QmlClass, index: number): string {
  const [lower, upper] = entry.bounds ?? [0, 0];
  return `      <range lower="${lower}" upper="${upper}" symbol="${index}" label="${escapeXml(entry.label)}" render="true"/>`;
}

function ruleXml(entry: QmlClass, index: number): string {
  return `      <rule key="renderer_rule_${index}" symbol="${index}" label="${escapeXml(entry.label)}" filter="${escapeXml(entry.filter ?? '')}"/>`;
}

/**
 * A graduated renderer over a column or over an expression: QGIS classifies by
 * either in the same `attr`, and its expression syntax is the one an expression
 * renderer writes, so an expression needs no encoding of its own.
 */
const rangesXml = (
  attribute: string,
  classes: QmlClass[],
  method: BreakMethod,
): [string, string[], string] => [
  `  <renderer-v2 type="${RENDERER_TYPES.graduated}" attr="${escapeXml(attribute)}" graduatedMethod="GraduatedColor" forceraster="0" symbollevels="0" enableorderby="0">`,
  ['    <ranges>', ...classes.map(rangeXml), '    </ranges>'],
  `    <classificationMethod id="${CLASSIFICATION_IDS[method]}"/>`,
];

function rendererXml(sym: Symbology | undefined, classes: QmlClass[]): [string, string[], string] {
  if (!sym) return [`  <renderer-v2 type="${RENDERER_TYPES.single}" forceraster="0" symbollevels="0" enableorderby="0">`, [], ''];
  switch (sym.kind) {
    case 'expression':
      return rangesXml(sym.expression, classes, 'equal');
    case 'categorized':
      return [
        `  <renderer-v2 type="${RENDERER_TYPES.categorized}" attr="${escapeXml(sym.field)}" forceraster="0" symbollevels="0" enableorderby="0">`,
        ['    <categories>', ...classes.map(categoryXml), '    </categories>'],
        '',
      ];
    case 'graduated':
      return rangesXml(sym.field, classes, sym.method);
    case 'rules':
      return [
        `  <renderer-v2 type="${RENDERER_TYPES.rules}" forceraster="0" symbollevels="0" enableorderby="0">`,
        ['    <rules key="renderer_rules">', ...classes.map(ruleXml), '    </rules>'],
        '',
      ];
  }
}

function scaleAttributes(range: ZoomRange | undefined): string {
  if (!range) return `hasScaleBasedVisibilityFlag="0" minScale="${UNLIMITED_MIN_SCALE}" maxScale="0"`;
  return `hasScaleBasedVisibilityFlag="1" minScale="${scaleDenominator(range.min)}" maxScale="${scaleDenominator(range.max)}"`;
}

/** What a QGIS layer style has no place for, so the panel can say it. */
export function qmlExportLosses(sym: Symbology | undefined): UnsupportedConstruct[] {
  if (sym?.kind !== 'expression') return [];
  const losses = [
    unsupportedNote(
      'ranges',
      `the ramp is written as ${EXPRESSION_STOPS} classes: a QGIS renderer colours by class, so a value between two classes reads as the lower one`,
    ),
  ];
  if (sym.sizes) {
    losses.push(
      unsupportedNote(
        'size',
        'the point sizes are dropped: a QGIS class sizes its symbol in the symbol\'s own units and these are pixels',
      ),
    );
  }
  return losses;
}

/**
 * The layer's symbology as a QGIS layer style. A layer with no symbology writes
 * a single-symbol renderer in its own colour, which is what QGIS calls the same
 * thing.
 */
export function symbologyToQml(layer: AgentLayer): string {
  const sym = layer.symbology;
  const geojson = layer.sourceGeojson ?? layer.geojson;
  const kind = geometryKinds(geojson)[0];
  const classes = sym
    ? classesOf(sym, geojson)
    : [{ label: layer.name, color: layerColor(layer) }];
  const [open, body, trailer] = rendererXml(sym, classes);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>",
    `<qgis version="${QGIS_VERSION}" styleCategories="AllStyleCategories" ${scaleAttributes(layer.zoomRange)}>`,
    open,
    ...body,
    '    <symbols>',
    ...classes.map((entry, index) => symbolXml(kind, index, entry.color)),
    '    </symbols>',
    ...(trailer ? [trailer] : []),
    '  </renderer-v2>',
    `  <layerOpacity>${layerStyle(layer).opacity}</layerOpacity>`,
    '</qgis>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- import

export interface QmlConversion {
  /** The QGIS version that wrote the file: a .qml names no layer. */
  source: string;
  /** Null when the file's renderer paints every feature the same. */
  symbology: Symbology | null;
  /** The single colour, where the renderer has one. */
  color: string | null;
  /** Fill opacity 0..1, where the file states one. */
  opacity: number | null;
  /** The zoom levels the file limits the layer to, or null for every zoom. */
  zoomRange: ZoomRange | null;
  unsupported: UnsupportedConstruct[];
}

/** Records what the symbology shape could not carry, once per distinct reason. */
type Note = (construct: string, detail: string, ruleIndex?: number | null) => void;

/** The colour a class's named symbol draws in. */
type ColorOf = (name: string | null) => string | null;

const childrenNamed = (parent: Element | null, name: string): Element[] =>
  parent ? [...parent.children].filter((child) => child.tagName === name) : [];

const firstChild = (parent: Element | null, name: string): Element | null =>
  childrenNamed(parent, name)[0] ?? null;

/** A symbol layer's properties, in either encoding QGIS has written. */
function symbolLayerProperties(symbolLayer: Element): Map<string, string> {
  const properties = new Map<string, string>();
  const options = [...symbolLayer.children].find(
    (child) => child.tagName === 'Option' && child.getAttribute('type') === 'Map',
  );
  for (const option of childrenNamed(options ?? null, 'Option')) {
    const name = option.getAttribute('name');
    const value = option.getAttribute('value');
    if (name && value !== null) properties.set(name, value);
  }
  for (const property of childrenNamed(symbolLayer, 'prop')) {
    const key = property.getAttribute('k');
    if (key) properties.set(key, property.getAttribute('v') ?? '');
  }
  return properties;
}

/** The colour a named symbol draws in, with everything else about it reported. */
function symbolColor(symbol: Element | undefined, note: Note): string | null {
  if (!symbol) return null;

  const symbolLayers = childrenNamed(symbol, 'layer');
  if (!symbolLayers.length) return null;
  if (symbolLayers.length > 1) {
    note('symbol', 'only the first symbol layer is read: a class carries one colour');
  }
  if (Number(symbol.getAttribute('alpha') ?? '1') < 1) {
    note('alpha', 'a symbol opacity of its own is dropped: opacity is set for the whole layer');
  }

  const symbolLayer = symbolLayers[0];
  const layerClass = symbolLayer.getAttribute('class') ?? '';
  const spec = SYMBOL_LAYER_CLASSES[layerClass];
  if (!spec) {
    note(layerClass || 'layer', `${layerClass || 'that symbol layer'} is not one this viewer reads a colour off`);
    return null;
  }

  const properties = symbolLayerProperties(symbolLayer);
  const dropped = spec.dropped.filter((key) => properties.has(key));
  if (dropped.length) {
    note(layerClass, `${dropped.join(', ')} dropped: a class carries its colour only`);
  }

  const read = fromQmlColor(properties.get(spec.colorKey) ?? '');
  if (!read) return null;
  if (read.alpha < 255) {
    note(spec.colorKey, 'a class colour transparency is dropped: opacity is set for the whole layer');
  }
  return read.color;
}

function categoryValue(raw: string, type: string | null): string | number {
  const asNumber = Number(raw);
  const numeric = type === null ? false : NUMERIC_VALUE_TYPES.includes(type);
  return numeric && Number.isFinite(asNumber) ? asNumber : raw;
}

function fromCategorized(renderer: Element, colorOf: ColorOf, note: Note): Symbology {
  const field = renderer.getAttribute('attr');
  if (!field) throw new Error('That style has a categorized renderer that names no field.');

  const categories: { value: string | number; color: string }[] = [];
  childrenNamed(firstChild(renderer, 'categories'), 'category').forEach((element, index) => {
    const color = colorOf(element.getAttribute('symbol'));
    const raw = element.getAttribute('value');
    if (raw === null) {
      note('val', 'a class matching several values is dropped: a category holds one value', index);
      return;
    }
    if (raw === '') {
      note('category', 'the all-other-values class is dropped: an unmatched feature keeps the layer colour', index);
      return;
    }
    if (element.getAttribute('render') === 'false') {
      note('category', `the hidden class ${raw} is dropped: every category in a symbology draws`, index);
      return;
    }
    if (!color) {
      note('category', `class ${raw} is dropped: nothing in its symbol gives a colour`, index);
      return;
    }
    categories.push({ value: categoryValue(raw, element.getAttribute('type')), color });
  });

  if (!categories.length) throw new Error('That style classifies by no category this viewer can draw.');
  return { kind: 'categorized', field, categories };
}

function breakMethod(renderer: Element, note: Note): BreakMethod {
  const id = firstChild(renderer, 'classificationMethod')?.getAttribute('id');
  const method = BREAK_METHODS.find((known) => CLASSIFICATION_IDS[known] === id);
  if (method) return method;

  const legacy = LEGACY_MODES[firstChild(renderer, 'mode')?.getAttribute('name') ?? ''];
  if (legacy) return legacy;

  note(
    'classificationMethod',
    `${id ?? 'the classification method'} is not one this viewer classifies by, so the breaks are kept as equal intervals`,
  );
  return 'equal';
}

interface QmlRange {
  lower: number;
  upper: number;
  color: string;
}

function graduatedRanges(renderer: Element, colorOf: ColorOf, note: Note): QmlRange[] {
  const ranges: QmlRange[] = [];
  childrenNamed(firstChild(renderer, 'ranges'), 'range').forEach((element, index) => {
    const lower = Number(element.getAttribute('lower'));
    const upper = Number(element.getAttribute('upper'));
    const color = colorOf(element.getAttribute('symbol'));
    if (!Number.isFinite(lower) || !color) {
      note('range', 'a class is dropped: it has no lower bound or no colour', index);
      return;
    }
    ranges.push({ lower, upper, color });
  });
  if (!ranges.length) {
    throw new Error('That style has a graduated renderer with no class this viewer can draw.');
  }
  return ranges;
}

/**
 * A renderer whose `attr` is arithmetic rather than a column name. QGIS writes
 * both in the same place, so which one this is comes off the parse.
 */
function fromExpressionRanges(
  expression: string,
  ranges: QmlRange[],
  note: Note,
): Symbology | null {
  const { node } = parseExpression(expression);
  if (!node || node.kind === 'field') return null;
  const domain: [number, number] = [ranges[0].lower, ranges[ranges.length - 1].upper];
  if (!(domain[1] > domain[0])) return null;

  const ramp = rampOfSamples(ranges.map((range) => range.color));
  if (!ramp) {
    note(
      'ranges',
      `those class colours are no ramp this viewer holds, so ramp ${ASSUMED_RAMP} stands in and the layer draws in that instead`,
    );
  }
  note(
    'ranges',
    'the classes are read back as one ramp across their whole range, so a feature draws in the colour its own value samples rather than its class colour',
  );
  return { kind: 'expression', expression, ramp: ramp ?? ASSUMED_RAMP, domain };
}

function fromGraduated(renderer: Element, colorOf: ColorOf, note: Note): Symbology {
  const field = renderer.getAttribute('attr');
  if (!field) throw new Error('That style has a graduated renderer that names no field.');
  if (renderer.getAttribute('graduatedMethod') === 'GraduatedSize') {
    note('graduatedMethod', 'the classes size the symbol rather than colour it, so their colours are all the renderer carries');
  }

  const ranges = graduatedRanges(renderer, colorOf, note);
  const expression = fromExpressionRanges(field, ranges, note);
  if (expression) return expression;

  note('range', 'the top class ceiling is dropped: a graduated class runs to the next break and the last one has no end');
  note('colorramp', `a .qml names no ramp this viewer knows, so ramp ${ASSUMED_RAMP} is a placeholder; the listed colours are what render`);
  return {
    kind: 'graduated',
    field,
    method: breakMethod(renderer, note),
    ramp: ASSUMED_RAMP,
    breaks: ranges.map((range) => range.lower),
    colors: ranges.map((range) => range.color),
  };
}

/** A filter as one property against one literal, which is all a rule tests. */
function parseFilter(filter: string): { field: string; op: RuleOp; value: string } | null {
  const match = filter.trim().match(FILTER_PATTERN);
  if (!match) return null;
  const op = OPS_BY_EXPRESSION[match[2]];
  if (!op) return null;
  const literal = match[3].trim();
  const quoted = literal.match(/^'(.*)'$/s);
  return { field: match[1].trim(), op, value: quoted ? quoted[1].replace(/''/g, "'") : literal };
}

function fromRules(renderer: Element, colorOf: ColorOf, note: Note): Symbology {
  const rulesElement = firstChild(renderer, 'rules');
  const rules: SymbologyRule[] = [];

  childrenNamed(rulesElement, 'rule').forEach((element, index) => {
    if (childrenNamed(element, 'rule').length) {
      note('rule', 'a rule holding rules of its own is read as one rule: a symbology rule does not nest', index);
    }
    if (element.getAttribute('scalemindenom') || element.getAttribute('scalemaxdenom')) {
      note('scalemindenom', 'a scale range on one rule is dropped: the zoom range is set for the whole layer', index);
    }

    const filter = element.getAttribute('filter') ?? '';
    const color = colorOf(element.getAttribute('symbol'));
    if (filter.trim().toUpperCase() === 'ELSE') {
      note('rule', 'the else rule is dropped: a feature no rule matches keeps the layer colour', index);
      return;
    }
    const parsed = parseFilter(filter);
    if (!parsed || !color) {
      note('filter', 'rule dropped: a symbology rule tests one property against one literal', index);
      return;
    }
    rules.push({ ...parsed, color });
  });

  if (!rules.length) throw new Error('That style has no rule this viewer can test.');
  return { kind: 'rules', rules };
}

function parseDocument(text: string): Element {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const root = document.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length || root.tagName === 'parsererror') {
    throw new Error('That file is not a QGIS layer style: it does not hold valid XML.');
  }
  if (root.tagName !== 'qgis') {
    throw new Error(`That file is not a QGIS layer style: its root element is <${root.tagName}>, not <qgis>.`);
  }
  return root;
}

function layerOpacity(root: Element): number | null {
  const opacity = Number(firstChild(root, 'layerOpacity')?.textContent);
  return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : null;
}

function zoomRangeOf(root: Element): ZoomRange | null {
  if (root.getAttribute('hasScaleBasedVisibilityFlag') !== '1') return null;
  return {
    min: zoomAtScale(root.getAttribute('minScale'), ZOOM_LIMITS.min),
    max: zoomAtScale(root.getAttribute('maxScale'), ZOOM_LIMITS.max),
  };
}

/**
 * A QGIS layer style as symbology. Throws when the file holds no renderer this
 * viewer can draw, saying which one it held.
 */
export function qmlToSymbology(text: string): QmlConversion {
  const root = parseDocument(text);
  const renderers = childrenNamed(root, 'renderer-v2');
  if (!renderers.length) throw new Error('That style has no vector renderer.');
  const renderer = renderers[0];

  const notes = new Map<string, UnsupportedConstruct>();
  const note: Note = (construct, detail, ruleIndex = null) => {
    const key = `${construct}\n${detail}`;
    if (!notes.has(key)) notes.set(key, { construct, rule_index: ruleIndex, rule_name: null, detail });
  };

  const symbols = new Map(
    childrenNamed(firstChild(renderer, 'symbols'), 'symbol').map((symbol) => [
      symbol.getAttribute('name') ?? '',
      symbol,
    ]),
  );
  const colorOf = (name: string | null) => symbolColor(symbols.get(name ?? ''), note);

  const type = renderer.getAttribute('type');
  let symbology: Symbology | null = null;
  let color: string | null = null;
  switch (type) {
    case RENDERER_TYPES.single:
      color = colorOf('0');
      if (!color) throw new Error('That style paints every feature the same, and nothing in it gives a colour.');
      break;
    case RENDERER_TYPES.categorized:
      symbology = fromCategorized(renderer, colorOf, note);
      break;
    case RENDERER_TYPES.graduated:
      symbology = fromGraduated(renderer, colorOf, note);
      break;
    case RENDERER_TYPES.rules:
      symbology = fromRules(renderer, colorOf, note);
      break;
    default:
      throw new Error(
        `That style draws with a ${type ?? 'nameless'} renderer, which this viewer cannot convert: it reads single symbol, categorized, graduated and rule-based renderers.`,
      );
  }

  return {
    source: `QGIS ${root.getAttribute('version') ?? 'style'}`,
    symbology,
    color,
    opacity: layerOpacity(root),
    zoomRange: zoomRangeOf(root),
    unsupported: [...notes.values()],
  };
}
