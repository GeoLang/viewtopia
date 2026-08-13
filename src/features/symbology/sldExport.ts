/**
 * Write a layer's symbology as an SLD 1.0 document. The constructs are the ones
 * fenestra's importer reads back: one Rule per class, an ogc filter naming the
 * property, and the class colour in a CssParameter. So a document exported here
 * converts to an equivalent renderer on the way back in.
 *
 * An expression renderer writes its arithmetic as ogc Add/Sub/Mul/Div in the
 * filter, which SLD 1.0 has a place for, but its ramp has to become classes:
 * SLD 1.0 has no colour interpolation without a vendor function.
 */
import type { AgentLayer } from '../../store/agentLayers';
import { parseExpression, type BinaryOperator, type ExpressionNode } from './expression';
import { unsupportedNote, type UnsupportedConstruct } from './sldConversion';
import {
  EXPRESSION_STOPS,
  expressionClasses,
  geometryKinds,
  shortNumber,
  type GeometryKind,
  type GraduatedSymbology,
  type RuleOp,
  type Symbology,
} from './symbology';

/** Polygon classes shade the fill, so the outline needs a colour of its own. */
const POLYGON_OUTLINE = '#333333';

const FILTER_TAGS: Record<RuleOp, string> = {
  '==': 'PropertyIsEqualTo',
  '!=': 'PropertyIsNotEqualTo',
  '<': 'PropertyIsLessThan',
  '<=': 'PropertyIsLessThanOrEqualTo',
  '>': 'PropertyIsGreaterThan',
  '>=': 'PropertyIsGreaterThanOrEqualTo',
};

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

const cssParameter = (name: string, value: string) =>
  `<CssParameter name="${name}">${escapeXml(value)}</CssParameter>`;

/** An SLD graphic is sized by its width, and a symbology sizes by radius. */
const graphicSize = (radius: number) => radius * 2;

function symbolizerXml(kind: GeometryKind, color: string, radius?: number): string {
  const fill = `<Fill>${cssParameter('fill', color)}</Fill>`;
  const size = radius === undefined ? '' : `<Size>${graphicSize(radius)}</Size>`;
  switch (kind) {
    case 'point':
      return `<PointSymbolizer><Graphic><Mark><WellKnownName>circle</WellKnownName>${fill}</Mark>${size}</Graphic></PointSymbolizer>`;
    case 'line':
      return `<LineSymbolizer><Stroke>${cssParameter('stroke', color)}</Stroke></LineSymbolizer>`;
    case 'polygon':
      return `<PolygonSymbolizer>${fill}<Stroke>${cssParameter('stroke', POLYGON_OUTLINE)}</Stroke></PolygonSymbolizer>`;
  }
}

const propertyNameXml = (field: string) =>
  `<ogc:PropertyName>${escapeXml(field)}</ogc:PropertyName>`;

const OGC_ARITHMETIC: Record<BinaryOperator, string> = {
  '+': 'Add',
  '-': 'Sub',
  '*': 'Mul',
  '/': 'Div',
};

/** An expression as the ogc arithmetic an SLD filter takes in a value's place. */
function ogcExpressionXml(node: ExpressionNode): string {
  switch (node.kind) {
    case 'number':
      return `<ogc:Literal>${node.value}</ogc:Literal>`;
    case 'field':
      return propertyNameXml(node.name);
    case 'binary': {
      const tag = `ogc:${OGC_ARITHMETIC[node.operator]}`;
      return `<${tag}>${ogcExpressionXml(node.left)}${ogcExpressionXml(node.right)}</${tag}>`;
    }
  }
}

function comparisonFilter(field: string, op: RuleOp, value: string): string {
  const tag = `ogc:${FILTER_TAGS[op]}`;
  const test = `${propertyNameXml(field)}<ogc:Literal>${escapeXml(value)}</ogc:Literal>`;
  return `<ogc:Filter><${tag}>${test}</${tag}></ogc:Filter>`;
}

function betweenFilter(subject: string, lower: number, upper: number): string {
  const bounds = `<ogc:LowerBoundary><ogc:Literal>${lower}</ogc:Literal></ogc:LowerBoundary><ogc:UpperBoundary><ogc:Literal>${upper}</ogc:Literal></ogc:UpperBoundary>`;
  return `<ogc:Filter><ogc:PropertyIsBetween>${subject}${bounds}</ogc:PropertyIsBetween></ogc:Filter>`;
}

interface SldClass {
  title: string;
  filter: string;
  color: string;
  /** Point radius in pixels, where the symbology sizes points. */
  radius?: number;
}

/**
 * The class edges as PropertyIsBetween wants them: a lower and an upper for
 * every class. A graduated renderer holds lower bounds only and its top class
 * runs to infinity, so the top edge comes from the data, or from one more class
 * width when the data has nothing above the last break.
 */
export function graduatedBounds(
  sym: GraduatedSymbology,
  geojson: GeoJSON.FeatureCollection,
): number[] {
  const values = geojson.features
    .map((feature) => feature.properties?.[sym.field])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const last = sym.breaks[sym.breaks.length - 1];
  const width = sym.breaks.length > 1 ? last - sym.breaks[sym.breaks.length - 2] : 0;
  const above = values.filter((value) => value > last);
  const top = above.length ? Math.max(...above) : last + (width > 0 ? width : 1);
  return [...sym.breaks, top];
}

function classesOf(sym: Symbology, geojson: GeoJSON.FeatureCollection): SldClass[] | null {
  switch (sym.kind) {
    case 'expression': {
      const { node } = parseExpression(sym.expression);
      if (!node) return null;
      const subject = ogcExpressionXml(node);
      return expressionClasses(sym).map(({ bounds, color, radius }) => ({
        title: `${sym.expression} ${shortNumber(bounds[0])} to ${shortNumber(bounds[1])}`,
        filter: betweenFilter(subject, bounds[0], bounds[1]),
        color,
        radius,
      }));
    }
    case 'categorized':
      return sym.categories.map((category) => ({
        title: `${sym.field} = ${category.value}`,
        filter: comparisonFilter(sym.field, '==', String(category.value)),
        color: category.color,
      }));
    case 'graduated': {
      const bounds = graduatedBounds(sym, geojson);
      return sym.breaks.map((_, index) => ({
        title: `${sym.field} ${bounds[index]} to ${bounds[index + 1]}`,
        filter: betweenFilter(propertyNameXml(sym.field), bounds[index], bounds[index + 1]),
        color: sym.colors[index],
      }));
    }
    case 'rules':
      return sym.rules.map((rule) => ({
        title: `${rule.field} ${rule.op} ${rule.value}`,
        filter: comparisonFilter(rule.field, rule.op, rule.value),
        color: rule.color,
      }));
  }
}

function ruleXml(entry: SldClass, kind: GeometryKind): string {
  return [
    '        <Rule>',
    `          <Title>${escapeXml(entry.title)}</Title>`,
    `          ${entry.filter}`,
    `          ${symbolizerXml(kind, entry.color, entry.radius)}`,
    '        </Rule>',
  ].join('\n');
}

/** What an SLD 1.0 document has no place for, so the panel can say it. */
export function sldExportLosses(sym: Symbology | undefined): UnsupportedConstruct[] {
  if (sym?.kind !== 'expression') return [];
  return [
    unsupportedNote(
      'PropertyIsBetween',
      `the ramp is written as ${EXPRESSION_STOPS} classes: SLD 1.0 interpolates no colour, so a value between two classes reads as the lower one`,
    ),
  ];
}

/** The layer's symbology as SLD 1.0, or null when it has no symbology. */
export function symbologyToSld(layer: AgentLayer): string | null {
  const sym = layer.symbology;
  if (!sym) return null;
  const geojson = layer.sourceGeojson ?? layer.geojson;
  const kind = geometryKinds(geojson)[0];
  const name = escapeXml(layer.name);
  const classes = classesOf(sym, geojson);
  if (!classes) return null;
  const rules = classes.map((entry) => ruleXml(entry, kind));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink">',
    '  <NamedLayer>',
    `    <Name>${name}</Name>`,
    '    <UserStyle>',
    `      <Name>${name}</Name>`,
    `      <Title>${sym.kind} symbology</Title>`,
    '      <FeatureTypeStyle>',
    ...rules,
    '      </FeatureTypeStyle>',
    '    </UserStyle>',
    '  </NamedLayer>',
    '</StyledLayerDescriptor>',
    '',
  ].join('\n');
}
