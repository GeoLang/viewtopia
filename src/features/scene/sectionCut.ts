import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
} from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../../offline/backends';
import { tileHighlightColor } from '../../viewer/tilesetStyle';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from '../elements/elementService';
import type { ClipAxis } from './clipping';

export type SectionPoint = [number, number, number];

export interface SectionPolygon {
  elementId: string;
  rings: SectionPoint[][];
}

export interface SectionCut {
  axis: ClipAxis;
  position: number;
  openChainsDropped: number;
  polygons: SectionPolygon[];
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
  { axis, position }: { axis: ClipAxis; position: number },
  signal: AbortSignal,
): Promise<SectionCut> {
  if (!getAuthToken()) throw new ElementApiError(SIGN_IN_MESSAGE, UNAUTHORIZED, null);
  const query = new URLSearchParams({ axis, position: String(position) });
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
const CAP_COLOR = Color.fromCssColorString('#5c5f66');

export function sectionCapPrimitive({
  tileset,
  cut,
  flip,
  selected,
}: {
  tileset: Cesium3DTileset;
  cut: SectionCut;
  flip: boolean;
  selected: ReadonlySet<string>;
}): Primitive {
  // applyTilesetSection keeps the side below the position, and the side above it when flipped
  const towardsRemovedSide = flip ? -CAP_OFFSET_METRES : CAP_OFFSET_METRES;
  const toPosition = ([x, y, z]: SectionPoint): Cartesian3 => {
    const position = new Cartesian3(x, y, z);
    position[cut.axis] += towardsRemovedSide;
    return position;
  };
  const capColor = ColorGeometryInstanceAttribute.fromColor(CAP_COLOR);
  const highlightColor = ColorGeometryInstanceAttribute.fromColor(tileHighlightColor());
  const anySelected = cut.polygons.some(({ elementId }) => selected.has(elementId));
  return new Primitive({
    geometryInstances: cut.polygons.map(
      ({ elementId, rings: [outer, ...holes] }) =>
        new GeometryInstance({
          // PolygonGeometry triangulates in the ellipsoid tangent plane, where an x or y cut is a line
          geometry: new CoplanarPolygonGeometry({
            polygonHierarchy: new PolygonHierarchy(
              outer.map(toPosition),
              holes.map((hole) => new PolygonHierarchy(hole.map(toPosition))),
            ),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          // Primitive projects positions to 2D after the instance modelMatrix and before its own
          modelMatrix: tileset.root.computedTransform,
          attributes: { color: selected.has(elementId) ? highlightColor : capColor },
          id: new SectionCapPick(tileset, elementId),
        }),
    ),
    // PerInstanceColorAppearance turns on alpha blending only when translucent is true
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: anySelected }),
  });
}
