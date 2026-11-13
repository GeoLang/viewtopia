import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
} from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../../offline/backends';
import { tileHighlightColor } from '../../viewer/tilesetStyle';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from '../elements/elementService';
import type { ClipAxis } from './clipping';
import { sectionFillStyle } from './sectionFill';

export type SectionPoint = [number, number, number];

export interface SectionPolygon {
  elementId: string;
  ifcClass?: string | null;
  rings: SectionPoint[][];
}

export interface SectionCut {
  axis: ClipAxis;
  position: number;
  normal?: [number, number, number] | null;
  offset?: number | null;
  openChainsDropped: number;
  polygons: SectionPolygon[];
}

export interface CutHalfSpace {
  normal: [number, number, number];
  offset: number;
}

export class SectionCapPick {
  constructor(
    readonly tileset: Cesium3DTileset,
    readonly elementId: string,
  ) {}
}

const UNAUTHORIZED = 401;
const NO_RESPONSE = 0;
const SIGN_IN_MESSAGE = 'Sign in to fill the cut of this model.';

export async function fetchSectionCut(
  assetId: string,
  cut: { axis: ClipAxis; position: number } | { normal: [number, number, number]; offset: number },
  signal: AbortSignal,
): Promise<SectionCut> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, UNAUTHORIZED, null);
  const query =
    'normal' in cut
      ? new URLSearchParams({
          nx: String(cut.normal[0]),
          ny: String(cut.normal[1]),
          nz: String(cut.normal[2]),
          offset: String(cut.offset),
        })
      : new URLSearchParams({ axis: cut.axis, position: String(cut.position) });
  let response: Response;
  try {
    // tiletopia reads the token from this header only, never the query string
    response = await fetch(`/v1/assets/${encodeURIComponent(assetId)}/section?${query}`, {
      headers: authHeaders(),
      signal,
    });
  } catch (failure) {
    // fetch rejects with a TypeError when no response arrives
    if (failure instanceof TypeError) {
      throw new ElementApiError(unreachableMessage('tiletopia', NO_RESPONSE), NO_RESPONSE, null);
    }
    throw failure;
  }
  const { status } = response;
  noticeRefusal(status);
  if (response.ok) return (await response.json()) as SectionCut;
  if (status === UNAUTHORIZED) throw new ElementApiError(SIGN_IN_MESSAGE, status, null);
  if (isUnreachableStatus(status)) {
    throw new ElementApiError(unreachableMessage('tiletopia', status), status, null);
  }
  const body = errorBodyOf(await response.text());
  throw new ElementApiError(
    body?.message ?? `tiletopia answered HTTP ${status}.`,
    status,
    body?.code ?? null,
  );
}

// one centimetre towards the removed side puts a cap in front of model faces that lie in the plane
const CAP_OFFSET_METRES = 0.01;
const CLIP_EPSILON_METRES = 1e-4;

function keptBy(point: SectionPoint, { normal, offset }: CutHalfSpace): boolean {
  const signed = normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2] - offset;
  return signed <= CLIP_EPSILON_METRES;
}

function crossesAt(start: SectionPoint, end: SectionPoint, { normal, offset }: CutHalfSpace): SectionPoint {
  const startSigned = normal[0] * start[0] + normal[1] * start[1] + normal[2] * start[2] - offset;
  const endSigned = normal[0] * end[0] + normal[1] * end[1] + normal[2] * end[2] - offset;
  const along = startSigned / (startSigned - endSigned);
  return [
    start[0] + along * (end[0] - start[0]),
    start[1] + along * (end[1] - start[1]),
    start[2] + along * (end[2] - start[2]),
  ];
}

export function clipRingToKeptSides(ring: SectionPoint[], clippers: readonly CutHalfSpace[]): SectionPoint[] {
  let current = ring;
  for (const clipper of clippers) {
    if (current.length === 0) return [];
    const next: SectionPoint[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const start = current[index];
      const end = current[(index + 1) % current.length];
      const startKept = keptBy(start, clipper);
      const endKept = keptBy(end, clipper);
      if (startKept) next.push(start);
      if (startKept !== endKept) next.push(crossesAt(start, end, clipper));
    }
    current = next;
  }
  return current;
}

export function sectionCapPrimitives({
  tileset,
  cut,
  flip,
  selected,
  clippers = [],
}: {
  tileset: Cesium3DTileset;
  cut: SectionCut;
  flip: boolean;
  selected: ReadonlySet<string>;
  clippers?: readonly CutHalfSpace[];
}): Primitive[] {
  // applyTilesetSection keeps the side below the position, and the side above it when flipped
  const towardsRemovedSide = flip ? -CAP_OFFSET_METRES : CAP_OFFSET_METRES;
  const toPosition = (point: SectionPoint): Cartesian3 => {
    if (cut.normal) {
      return new Cartesian3(
        point[0] + cut.normal[0] * CAP_OFFSET_METRES,
        point[1] + cut.normal[1] * CAP_OFFSET_METRES,
        point[2] + cut.normal[2] * CAP_OFFSET_METRES,
      );
    }
    const position = new Cartesian3(point[0], point[1], point[2]);
    position[cut.axis] += towardsRemovedSide;
    return position;
  };
  const colorAttributes = new Map<string, ColorGeometryInstanceAttribute>();
  const colorAttribute = (css: string): ColorGeometryInstanceAttribute => {
    const existing = colorAttributes.get(css);
    if (existing) return existing;
    const created = ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(css));
    colorAttributes.set(css, created);
    return created;
  };
  const highlightColor = ColorGeometryInstanceAttribute.fromColor(tileHighlightColor());
  const anySelected = cut.polygons.some(({ elementId }) => selected.has(elementId));
  const modelMatrix = tileset.root.computedTransform;
  const fillInstances: GeometryInstance[] = [];
  const lineInstances: GeometryInstance[] = [];
  for (const { elementId, ifcClass, rings } of cut.polygons) {
    const clipped = rings.map((ring) => clipRingToKeptSides(ring, clippers));
    const [outer, ...holes] = clipped;
    if (!outer || outer.length < 3) continue;
    const style = sectionFillStyle(ifcClass);
    const chosen = selected.has(elementId);
    fillInstances.push(
      new GeometryInstance({
        geometry: new CoplanarPolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(
            outer.map(toPosition),
            holes.map((hole) => new PolygonHierarchy(hole.map(toPosition))),
          ),
          vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
        }),
        modelMatrix,
        attributes: { color: chosen ? highlightColor : colorAttribute(style.fill) },
        id: new SectionCapPick(tileset, elementId),
      }),
    );
    const lineColor = chosen ? highlightColor : colorAttribute(style.line);
    for (const ring of [outer, ...holes]) {
      if (ring.length < 2) continue;
      const positions = ring.map(toPosition);
      const first = positions[0];
      const last = positions[positions.length - 1];
      const closed =
        first.x === last.x && first.y === last.y && first.z === last.z
          ? positions
          : [...positions, first];
      lineInstances.push(
        new GeometryInstance({
          geometry: new PolylineGeometry({
            positions: closed,
            width: style.width,
            vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix,
          attributes: { color: lineColor },
          id: new SectionCapPick(tileset, elementId),
        }),
      );
    }
  }
  const primitives: Primitive[] = [];
  if (fillInstances.length > 0) {
    primitives.push(
      new Primitive({
        geometryInstances: fillInstances,
        appearance: new PerInstanceColorAppearance({ flat: true, translucent: anySelected }),
      }),
    );
  }
  if (lineInstances.length > 0) {
    primitives.push(
      new Primitive({
        geometryInstances: lineInstances,
        appearance: new PolylineColorAppearance({ translucent: anySelected }),
      }),
    );
  }
  return primitives;
}
