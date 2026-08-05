/**
 * The tool catalogue the panel renders from. One row per tool says which inputs
 * it reads and which parameter fields it shows, so adding a tool cannot forget
 * a field the run path needs.
 */

export type ToolId =
  | 'buffer'
  | 'simplify'
  | 'centroid'
  | 'convex-hull'
  | 'explode'
  | 'collect'
  | 'intersection'
  | 'difference'
  | 'clip'
  | 'clip-rect'
  | 'dissolve'
  | 'union'
  | 'voronoi'
  | 'grid-square'
  | 'grid-hex'
  | 'spatial-join'
  | 'validate'
  | 'make-valid';

export type ToolGroup = 'Geometry' | 'Overlay' | 'Aggregate' | 'Generate' | 'Join' | 'Quality';

export type ParamKey = 'distance' | 'segments' | 'tolerance' | 'field' | 'extent' | 'cellSize' | 'predicate' | 'prefix';

export interface ToolSpec {
  label: string;
  group: ToolGroup;
  /** label of the second input picker, absent when the tool reads one layer */
  second?: string;
  /** reads several layers at once, concatenated before the run */
  multi?: boolean;
  /** reads no layer at all */
  noInput?: boolean;
  params: readonly ParamKey[];
  /** where an extent field starts from */
  extentFrom?: 'view' | 'input';
  hint?: string;
}

export const TOOLS: Record<ToolId, ToolSpec> = {
  buffer: {
    label: 'Buffer',
    group: 'Geometry',
    params: ['distance', 'segments'],
    hint: 'A negative distance erodes, and features that erode away are dropped.',
  },
  simplify: { label: 'Simplify', group: 'Geometry', params: ['tolerance'] },
  centroid: { label: 'Centroid', group: 'Geometry', params: [] },
  'convex-hull': { label: 'Convex hull', group: 'Geometry', params: [] },
  explode: { label: 'Explode to single parts', group: 'Geometry', params: [] },
  collect: { label: 'Collect to multi-part', group: 'Geometry', params: [] },
  intersection: { label: 'Intersection', group: 'Overlay', second: 'Overlay layer', params: [] },
  difference: { label: 'Difference', group: 'Overlay', second: 'Overlay layer', params: [] },
  clip: {
    label: 'Clip to layer',
    group: 'Overlay',
    second: 'Clip layer',
    params: [],
    hint: 'The clip layer must be polygons; the input can be any type.',
  },
  'clip-rect': {
    label: 'Clip to extent',
    group: 'Overlay',
    params: ['extent'],
    extentFrom: 'view',
  },
  dissolve: {
    label: 'Dissolve',
    group: 'Aggregate',
    params: ['field'],
    hint: 'Polygons only. Without a field every polygon merges into one.',
  },
  union: {
    label: 'Union of layers',
    group: 'Aggregate',
    multi: true,
    params: [],
    hint: 'Concatenates the picked layers, then dissolves them into one polygon set.',
  },
  voronoi: {
    label: 'Voronoi cells',
    group: 'Generate',
    params: ['extent'],
    extentFrom: 'input',
    hint: 'Point features only. Each cell keeps its point’s properties.',
  },
  'grid-square': {
    label: 'Square grid',
    group: 'Generate',
    noInput: true,
    params: ['extent', 'cellSize'],
    extentFrom: 'view',
  },
  'grid-hex': {
    label: 'Hex grid',
    group: 'Generate',
    noInput: true,
    params: ['extent', 'cellSize'],
    extentFrom: 'view',
  },
  'spatial-join': {
    label: 'Spatial join',
    group: 'Join',
    second: 'Source layer',
    params: ['predicate', 'prefix'],
    hint: 'intersects and within need polygon sources; nearest works by centroid distance.',
  },
  validate: { label: 'Check validity', group: 'Quality', params: [] },
  'make-valid': { label: 'Make valid', group: 'Quality', params: [] },
};

export const TOOL_GROUPS: ToolGroup[] = [
  'Geometry',
  'Overlay',
  'Aggregate',
  'Generate',
  'Join',
  'Quality',
];

export function toolsInGroup(group: ToolGroup): { id: ToolId; label: string }[] {
  return (Object.keys(TOOLS) as ToolId[])
    .filter((id) => TOOLS[id].group === group)
    .map((id) => ({ id, label: TOOLS[id].label }));
}
