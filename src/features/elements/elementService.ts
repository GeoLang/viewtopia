import { ElementService, RequestErrorEvent, Resource } from 'cesium';
import { getAuthToken } from '../auth/store';
import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../../offline/backends';
import { ELEMENT_ID_LIMIT, requireWithinElementLimit } from './store';

const UNAUTHORIZED = 401;
const NO_RESPONSE = 0;
const SIGN_IN_MESSAGE = 'Sign in to browse the elements of this model.';
// tiletopia refuses a larger page
const LARGEST_PAGE = 1000;
// search has no total across pages, and at 50 results a page this is 20 requests
const SEARCH_ID_LIMIT = 1000;
// tiletopia refuses more entries in one $in
const IDS_PER_REQUEST = 100;
const STOREY_CLASS = 'IfcBuildingStorey';

export type ElementFilter = Record<string, unknown>;

export interface ElementProperty {
  value: string | number | boolean;
  displayValue: string;
  units: string | null;
}

export interface ElementRow extends ElementService.Element {
  ifcClass: string;
}

export interface ElementListRow extends ElementRow {
  storey: string | null;
}

export interface ElementDetail extends ElementListRow {
  parentId: string | null;
  properties: Record<string, ElementProperty>;
}

export interface ElementListPage {
  items: ElementListRow[];
  total: number;
  continuationToken?: string;
}

export interface ElementSearchPage {
  items: ElementRow[];
  continuationToken?: string;
}

export interface ElementTreeNode extends ElementService.ElementTreeNode {
  key: string;
  kind: string;
  ifcClass: string;
  // tiletopia derives this from the storey placement, or its IFC Elevation without one, in metres above the ellipsoid
  baseHeight?: number;
}

export interface ElementTreePathEntry extends ElementService.ElementTreePathEntry {
  kind: string;
}

export interface ElementAggregation extends ElementService.Aggregation {
  propertyKey: string;
  units: string[];
}

export interface ElementGroup {
  value: string | number | boolean | null;
  total: number;
  aggregations: ElementAggregation[];
}

export interface ElementGroups {
  total: number;
  aggregations: ElementAggregation[];
  groups: ElementGroup[];
}

interface WireListRow {
  id: string;
  label: string | null;
  location?: ElementService.ElementLocation;
  ifcClass: string;
  storey: string | null;
}

interface WireSearchRow {
  id: string;
  location?: ElementService.ElementLocation;
  properties: { className: string; userLabel?: string };
}

export class ElementApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

export function errorBodyOf(response: unknown): { code?: string; message?: string } | null {
  if (typeof response !== 'string' || response === '') return null;
  try {
    return JSON.parse(response) as { code?: string; message?: string };
  } catch (failure) {
    // nginx answers with html when tiletopia is down
    if (failure instanceof SyntaxError) return null;
    throw failure;
  }
}

function elementApiError(failure: RequestErrorEvent): ElementApiError {
  const status = failure.statusCode ?? NO_RESPONSE;
  noticeRefusal(status);
  if (status === UNAUTHORIZED) return new ElementApiError(SIGN_IN_MESSAGE, status, null);
  if (isUnreachableStatus(status)) {
    return new ElementApiError(unreachableMessage('tiletopia', status), status, null);
  }
  const body = errorBodyOf(failure.response);
  return new ElementApiError(
    body?.message ?? `The element service answered HTTP ${status}.`,
    status,
    body?.code ?? null,
  );
}

async function readElementJson<T>(
  assetId: string,
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, UNAUTHORIZED, null);
  // tiletopia reads the token from this header only, never the query string
  const resource = new Resource({
    url: `/v1/assets/${encodeURIComponent(assetId)}/`,
    headers: authHeaders(),
  }).getDerivedResource({
    url: path,
    queryParameters: Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined),
    ),
  });
  try {
    return (await resource.fetchJson()) as T;
  } catch (failure) {
    if (failure instanceof RequestErrorEvent) throw elementApiError(failure);
    throw failure;
  }
}

function serializedFilter(filter: ElementFilter | undefined): string | undefined {
  return filter === undefined ? undefined : JSON.stringify(filter);
}

function listRowFrom(row: WireListRow): ElementListRow {
  return { ...row, label: row.label ?? undefined };
}

export class TiletopiaElementService extends ElementService {
  constructor(readonly assetId: string) {
    super();
  }

  async listElements({
    top,
    continuationToken,
    filter,
  }: { top?: number; continuationToken?: string; filter?: ElementFilter } = {}): Promise<ElementListPage> {
    const page = await readElementJson<{
      items: WireListRow[];
      total: number;
      continuationToken?: string;
    }>(this.assetId, 'elements', { top, continuationToken, filter: serializedFilter(filter) });
    return { ...page, items: page.items.map(listRowFrom) };
  }

  async getElement(elementId: string): Promise<ElementDetail> {
    const element = await readElementJson<
      WireListRow & { parentId: string | null; properties: Record<string, ElementProperty> }
    >(this.assetId, `elements/${encodeURIComponent(elementId)}`);
    return { ...element, label: element.label ?? undefined };
  }

  aggregate({
    propertyKeys,
    filter,
  }: {
    propertyKeys: string[];
    filter?: ElementFilter;
  }): Promise<{ aggregations: ElementAggregation[]; total: number }> {
    return readElementJson(this.assetId, 'elements/aggregate', {
      aggregations: JSON.stringify(propertyKeys),
      filter: serializedFilter(filter),
    });
  }

  getElementTreeChildren({ nodeKey }: { nodeKey?: string } = {}): Promise<{ nodes: ElementTreeNode[] }> {
    return readElementJson(this.assetId, 'tree/children', { nodeKey });
  }

  getElementTreeParents(elementId: string): Promise<{ path: ElementTreePathEntry[] }> {
    return readElementJson(this.assetId, 'tree/parents', { elementId });
  }
}

export async function searchElements(
  assetId: string,
  search: string,
  continuationToken?: string,
): Promise<ElementSearchPage> {
  const page = await readElementJson<{ items: WireSearchRow[]; continuationToken?: string }>(
    assetId,
    'elements/search',
    { search, continuationToken },
  );
  return {
    continuationToken: page.continuationToken,
    items: page.items.map(({ id, location, properties }) => ({
      id,
      location,
      label: properties.userLabel,
      ifcClass: properties.className,
    })),
  };
}

export function groupElements(
  assetId: string,
  groupBy: string,
  filter?: ElementFilter,
): Promise<ElementGroups> {
  return readElementJson(assetId, 'elements/aggregate', {
    groupBy,
    filter: serializedFilter(filter),
  });
}

export function elementFilter({
  ifcClass,
  storey,
}: {
  ifcClass?: string;
  storey?: string;
}): ElementFilter {
  return {
    ...(ifcClass === undefined ? {} : { '@classFullName': ifcClass }),
    ...(storey === undefined ? {} : { '@storey': storey }),
  };
}

export async function listMatchingElements(
  service: TiletopiaElementService,
  filter: ElementFilter,
): Promise<ElementListRow[]> {
  const rows: ElementListRow[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await service.listElements({ top: LARGEST_PAGE, continuationToken, filter });
    if (page.total > ELEMENT_ID_LIMIT) {
      throw new Error(
        `${page.total} elements match, over the limit of ${ELEMENT_ID_LIMIT}. Narrow the choice by class or storey.`,
      );
    }
    rows.push(...page.items);
    continuationToken = page.continuationToken;
  } while (continuationToken !== undefined);
  return rows;
}

export async function searchMatchingElements(assetId: string, search: string): Promise<ElementRow[]> {
  const rows: ElementRow[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await searchElements(assetId, search, continuationToken);
    rows.push(...page.items);
    if (rows.length > SEARCH_ID_LIMIT) {
      throw new Error(
        `The search "${search}" matches over ${SEARCH_ID_LIMIT} elements, the most a search can choose. Narrow it, or choose by class or storey.`,
      );
    }
    continuationToken = page.continuationToken;
  } while (continuationToken !== undefined);
  return rows;
}

export function withMesh<Row extends ElementRow>(rows: Row[]): Row[] {
  return rows.filter((row) => row.location !== undefined);
}

export async function readElementsById(
  service: TiletopiaElementService,
  ids: Iterable<string>,
): Promise<{ rows: ElementListRow[]; notFound: string[] }> {
  const wanted = [...new Set(ids)];
  requireWithinElementLimit(wanted.length);
  const rows: ElementListRow[] = [];
  for (let start = 0; start < wanted.length; start += IDS_PER_REQUEST) {
    const $in = wanted.slice(start, start + IDS_PER_REQUEST);
    const page = await service.listElements({ top: IDS_PER_REQUEST, filter: { '@id': { $in } } });
    rows.push(...page.items);
  }
  const found = new Set(rows.map((row) => row.id));
  return { rows, notFound: wanted.filter((id) => !found.has(id)) };
}

async function treeNodeOf(service: TiletopiaElementService, elementId: string): Promise<ElementTreeNode> {
  const { path } = await service.getElementTreeParents(elementId);
  let { nodes } = await service.getElementTreeChildren();
  for (const [depth, entry] of path.entries()) {
    const node = nodes.find((known) => known.id === entry.id);
    if (!node) throw new Error(`tree/parents named ${entry.id}, which is not a child of its parent.`);
    if (depth === path.length - 1) return node;
    ({ nodes } = await service.getElementTreeChildren({ nodeKey: node.key }));
  }
  throw new Error(`tree/parents answered no path for ${elementId}.`);
}

export async function meshedContentsOf(
  service: TiletopiaElementService,
  node: ElementTreeNode,
): Promise<ElementRow[]> {
  const rows = new Map<string, ElementRow>();
  const walked = new Set<string>();

  const collectStoreyByFilter = async (storeyNode: ElementTreeNode): Promise<boolean> => {
    const { storey } = await service.getElement(storeyNode.id);
    if (storey === null) return false;
    // @storey is a name, so two storeys called Level 1 in one model share it
    const sameName = await service.listElements({
      top: 1,
      filter: { '@classFullName': STOREY_CLASS, '@storey': storey },
    });
    if (sameName.total !== 1) return false;
    for (const row of await listMatchingElements(service, { '@storey': storey })) rows.set(row.id, row);
    if (!storeyNode.hasChildren) return true;
    // an element's @storey is its nearest storey, so a storey under this one is not in that filter
    const { nodes } = await service.getElementTreeChildren({ nodeKey: storeyNode.key });
    for (const child of nodes) {
      if (child.kind === 'model') await collect(child);
    }
    return true;
  };

  const collect = async (current: ElementTreeNode): Promise<void> => {
    if (current.kind === 'model' && (await collectStoreyByFilter(current))) return;
    if (current.kind === 'element') walked.add(current.id);
    requireWithinElementLimit(rows.size + walked.size);
    if (!current.hasChildren) return;
    const { nodes } = await service.getElementTreeChildren({ nodeKey: current.key });
    for (const child of nodes) await collect(child);
  };

  await collect(node);
  const { rows: checked } = await readElementsById(service, walked);
  for (const row of checked) rows.set(row.id, row);
  return withMesh([...rows.values()]);
}

export interface ResolvedElements {
  located: ElementRow[];
  notFound: string[];
  withoutMesh: string[];
}

export async function resolveElementIds(
  service: TiletopiaElementService,
  ids: Iterable<string>,
): Promise<ResolvedElements> {
  const { rows, notFound } = await readElementsById(service, ids);
  const located = new Map(withMesh(rows).map((row): [string, ElementRow] => [row.id, row]));
  const withoutMesh: string[] = [];
  for (const row of rows) {
    if (row.location !== undefined) continue;
    const contents = await meshedContentsOf(service, await treeNodeOf(service, row.id));
    if (contents.length === 0) withoutMesh.push(row.id);
    for (const content of contents) located.set(content.id, content);
  }
  return { located: [...located.values()], notFound, withoutMesh };
}

export async function resolveElementFilter(
  service: TiletopiaElementService,
  filter: ElementFilter,
): Promise<ResolvedElements> {
  const rows = await listMatchingElements(service, filter);
  return {
    located: withMesh(rows),
    notFound: [],
    withoutMesh: rows.filter((row) => row.location === undefined).map((row) => row.id),
  };
}
