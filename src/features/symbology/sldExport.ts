/**
 * Write a layer's symbology as an SLD 1.0 document. The constructs are the ones
 * fenestra's importer reads back: one Rule per class, an ogc filter naming the
 * property, and the class colour in a CssParameter. So a document exported here
 * converts to an equivalent renderer on the way back in.
 */
import type { AgentLayer } from '../../store/agentLayers';
import {
  geometryKinds,
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

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

const cssParameter = (name: string, value: string) =>
  `<CssParameter name="${name}">${escapeXml(value)}</CssParameter>`;

function symbolizerXml(kind: GeometryKind, color: string): string {
  const fill = `<Fill>${cssParameter('fill', color)}</Fill>`;
  switch (kind) {
    case 'point':
      return `<PointSymbolizer><Graphic><Mark><WellKnownName>circle</WellKnownName>${fill}</Mark></Graphic></PointSymbolizer>`;
    case 'line':
      return `<LineSymbolizer><Stroke>${cssParameter('stroke', color)}</Stroke></LineSymbolizer>`;
    case 'polygon':
      return `<PolygonSymbolizer>${fill}<Stroke>${cssParameter('stroke', POLYGON_OUTLINE)}</Stroke></PolygonSymbolizer>`;
  }
}

function comparisonFilter(field: string, op: RuleOp, value: string): string {
  const tag = `ogc:${FILTER_TAGS[op]}`;
  const test = `<ogc:PropertyName>${escapeXml(field)}</ogc:PropertyName><ogc:Literal>${escapeXml(value)}</ogc:Literal>`;
  return `<ogc:Filter><${tag}>${test}</${tag}></ogc:Filter>`;
}

function betweenFilter(field: string, lower: number, upper: number): string {
  const bounds = `<ogc:LowerBoundary><ogc:Literal>${lower}</ogc:Literal></ogc:LowerBoundary><ogc:UpperBoundary><ogc:Literal>${upper}</ogc:Literal></ogc:UpperBoundary>`;
  return `<ogc:Filter><ogc:PropertyIsBetween><ogc:PropertyName>${escapeXml(field)}</ogc:PropertyName>${bounds}</ogc:PropertyIsBetween></ogc:Filter>`;
}

interface SldClass {
  title: string;
  filter: string;
  color: string;
}

/**
 * The class edges as PropertyIsBetween wants them: a lower and an upper for
 * every class. A graduated renderer holds lower bounds only and its top class
 * runs to infinity, so the top edge comes from the data, or from one more class
 * width when the data has nothing above the last break.
 */
function graduatedBounds(sym: GraduatedSymbology, geojson: GeoJSON.FeatureCollection): number[] {
  const values = geojson.features
    .map((feature) => feature.properties?.[sym.field])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const last = sym.breaks[sym.breaks.length - 1];
  const width = sym.breaks.length > 1 ? last - sym.breaks[sym.breaks.length - 2] : 0;
  const above = values.filter((value) => value > last);
  const top = above.length ? Math.max(...above) : last + (width > 0 ? width : 1);
  return [...sym.breaks, top];
}

function classesOf(sym: Symbology, geojson: GeoJSON.FeatureCollection): SldClass[] {
  switch (sym.kind) {
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
        filter: betweenFilter(sym.field, bounds[index], bounds[index + 1]),
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
    `          ${symbolizerXml(kind, entry.color)}`,
    '        </Rule>',
  ].join('\n');
}

/** The layer's symbology as SLD 1.0, or null when it has no symbology. */
export function symbologyToSld(layer: AgentLayer): string | null {
  const sym = layer.symbology;
  if (!sym) return null;
  const geojson = layer.sourceGeojson ?? layer.geojson;
  const kind = geometryKinds(geojson)[0];
  const name = escapeXml(layer.name);
  const rules = classesOf(sym, geojson).map((entry) => ruleXml(entry, kind));

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
