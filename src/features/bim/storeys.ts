import { Cartesian3, Cartographic, Ellipsoid, Matrix4 } from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import { ASSET_ID_PROPERTY } from '../../live/types';
import { elementIdColumn, type ElementIdColumn } from '../../viewer/tilesetStyle';
import {
  applyTilesetSection,
  disableTilesetSection,
  sectionFrame,
  type TilesetSection,
} from '../scene/tilesetSection';
import {
  TiletopiaElementService,
  meshedContentsOf,
  type ElementRow,
  type ElementTreeNode,
} from '../elements/elementService';
import { useElementStore } from '../elements/store';
import {
  requireBimSession,
  storeyViewShowing,
  useBimModeStore,
  type BimSession,
  type StoreyContents,
  type StoreyScope,
} from './store';

export interface Storey {
  node: ElementTreeNode;
  parentKey: string | null;
  label: string;
}

export interface ShownStorey {
  storeys: Storey[];
  elementCount: number;
  idColumn: ElementIdColumn;
}

function serviceFor({ model }: BimSession): TiletopiaElementService {
  if (model.assetId === null) {
    throw new Error(`${model.name} is not a tiletopia asset, so it has no storeys to choose from.`);
  }
  return new TiletopiaElementService(model.assetId);
}

async function listStoreys(service: TiletopiaElementService): Promise<Storey[]> {
  const found: { node: ElementTreeNode; parent: ElementTreeNode | undefined }[] = [];
  const walk = async (parent?: ElementTreeNode): Promise<void> => {
    const { nodes } = await service.getElementTreeChildren({ nodeKey: parent?.key });
    for (const node of nodes) {
      // tree/children of a storey lists up to 50000 elements, and meshedContentsOf reaches any storey nested inside it
      if (node.kind === 'model') found.push({ node, parent });
      else if (node.kind === 'subject' && node.hasChildren) await walk(node);
    }
  };
  await walk();
  const severalParents = new Set(found.map(({ parent }) => parent?.key)).size > 1;
  return found.map(({ node, parent }) => ({
    node,
    parentKey: parent?.key ?? null,
    label: severalParents && parent ? `${parent.label} / ${node.label}` : node.label,
  }));
}

export async function bimStoreys(): Promise<Storey[]> {
  const session = requireBimSession();
  const known = useBimModeStore.getState().storeys;
  if (known) return known;
  const storeys = await listStoreys(serviceFor(session));
  if (useBimModeStore.getState().session === session) useBimModeStore.setState({ storeys });
  return storeys;
}

export function findStorey(storeys: Storey[], wanted: string): Storey {
  const matches = storeys.filter(
    ({ node, label }) => label === wanted || node.label === wanted || node.id === wanted,
  );
  if (matches.length === 1) return matches[0];
  const candidates = matches.length === 0 ? storeys : matches;
  const listed = candidates.map(({ node, label }) => `${label} (${node.id})`).join(', ');
  if (matches.length === 0) throw new Error(`no storey is called ${wanted}. The storeys are: ${listed}`);
  throw new Error(`${wanted} matches ${matches.length} storeys, so name one by its id: ${listed}`);
}

function middleHeight(rows: ElementRow[]): number | null {
  const heights = rows
    .flatMap((row) => (row.location ? [row.location.center.height] : []))
    .sort((lower, higher) => lower - higher);
  return heights.length === 0 ? null : heights[Math.floor(heights.length / 2)];
}

async function contentsOf(
  session: BimSession,
  service: TiletopiaElementService,
  storey: Storey,
): Promise<StoreyContents> {
  const known = session.storeyContents.get(storey.node.key);
  if (known) return known;
  const rows = await meshedContentsOf(service, storey.node);
  const contents = { ids: rows.map((row) => row.id), middleHeight: middleHeight(rows) };
  session.storeyContents.set(storey.node.key, contents);
  return contents;
}

async function storeysAtOrBelow(
  session: BimSession,
  service: TiletopiaElementService,
  chosen: Storey,
): Promise<Storey[]> {
  const siblings = (await bimStoreys()).filter((storey) => storey.parentKey === chosen.parentKey);
  const heights = new Map<Storey, number | null>();
  for (const storey of siblings) {
    heights.set(storey, (await contentsOf(session, service, storey)).middleHeight);
  }
  const chosenHeight = heights.get(chosen) ?? null;
  if (chosenHeight === null) {
    throw new Error(`${chosen.label} has no element with a mesh, so nothing shows where it sits.`);
  }
  return siblings.filter((storey) => {
    const height = heights.get(storey) ?? null;
    return height !== null && height <= chosenHeight;
  });
}

let latestStoreyChoice = 0;

export async function showStorey(storey: Storey, scope: StoreyScope): Promise<ShownStorey | null> {
  const session = requireBimSession();
  const idColumn = elementIdColumn(session.tileset);
  if (idColumn === 'absent') {
    throw new Error(
      `${session.model.name} has no ${ASSET_ID_PROPERTY} column on its tile features, so a storey cannot be shown by element.`,
    );
  }
  latestStoreyChoice += 1;
  const choice = latestStoreyChoice;
  const service = serviceFor(session);
  const storeys = scope === 'only' ? [storey] : await storeysAtOrBelow(session, service, storey);
  const ids: string[] = [];
  for (const shown of storeys) ids.push(...(await contentsOf(session, service, shown)).ids);
  const { session: sessionNow, storeyView } = useBimModeStore.getState();
  if (choice !== latestStoreyChoice || sessionNow !== session) return null;
  if (ids.length === 0) {
    throw new Error(`${storey.label} has no element with a mesh, so nothing changed.`);
  }
  const elements = useElementStore.getState();
  const showing = storeyViewShowing(storeyView, elements.isolated);
  const isolatedBefore = showing ? showing.isolatedBefore : elements.isolated;
  elements.isolateElements(ids);
  const { isolated } = useElementStore.getState();
  if (!isolated) throw new Error('isolateElements left no isolated set.');
  useBimModeStore.setState({
    storeyView: { storeyKey: storey.node.key, scope, isolated, isolatedBefore },
  });
  return { storeys, elementCount: isolated.size, idColumn };
}

export type StoreyTop = { kind: 'known'; above: Storey; height: number } | { kind: 'unknown'; reason: string };

export function storeyTop(storeys: Storey[], storey: Storey): StoreyTop {
  const base = storey.node.baseHeight;
  if (base === undefined) {
    return { kind: 'unknown', reason: `${storey.label} has no elevation in the model, so its top is unknown.` };
  }
  const higher = storeys.flatMap((other) =>
    other.parentKey === storey.parentKey && other.node.baseHeight !== undefined && other.node.baseHeight > base
      ? [{ storey: other, height: other.node.baseHeight }]
      : [],
  );
  if (higher.length === 0) {
    return { kind: 'unknown', reason: `No storey with an elevation is above ${storey.label}, so its top is unknown.` };
  }
  const next = higher.reduce((lowest, candidate) => (candidate.height < lowest.height ? candidate : lowest));
  return { kind: 'known', above: next.storey, height: next.height };
}

// 0.08 degrees from the ellipsoid normal
const VERTICAL_COSINE = 1 - 1e-6;

function horizontalSection(tileset: Cesium3DTileset, height: number): TilesetSection {
  const frame = sectionFrame(tileset);
  const origin = Matrix4.getTranslation(frame, new Cartesian3());
  const cartographic: Cartographic | undefined = Cartographic.fromCartesian(origin);
  if (!cartographic) {
    throw new Error('The model frame sits at the centre of the earth, so a height cannot be placed in it.');
  }
  const frameUp = Matrix4.multiplyByPointAsVector(frame, Cartesian3.UNIT_Z, new Cartesian3());
  const surfaceUp = Ellipsoid.WGS84.geodeticSurfaceNormal(origin, new Cartesian3());
  if (Cartesian3.dot(Cartesian3.normalize(frameUp, frameUp), surfaceUp) < VERTICAL_COSINE) {
    throw new Error('The z axis of the model is not vertical, so a section along it would not be level.');
  }
  const point = Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, height);
  const inFrame = Matrix4.multiplyByPoint(Matrix4.inverse(frame, new Matrix4()), point, new Cartesian3());
  return { axis: 'z', position: inFrame.z, flip: false, enabled: true };
}

export function sectionAtHeight(height: number): void {
  const { viewer, tileset } = requireBimSession();
  applyTilesetSection(tileset, horizontalSection(tileset, height), () => viewer.scene.requestRender());
}

export function removeSection(): void {
  const { viewer, tileset } = requireBimSession();
  disableTilesetSection(tileset, () => viewer.scene.requestRender());
}
