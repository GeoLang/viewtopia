/**
 * World file sidecar (.wld/.jgw/.pgw/...): six numbers mapping pixel space to
 * the image's coordinate system. Line order is fixed by the format:
 * x-scale, y-skew, x-skew, y-scale, then x/y of the top-left pixel center.
 */
export interface WorldFileTransform {
  scaleX: number;
  skewY: number;
  skewX: number;
  scaleY: number;
  originX: number;
  originY: number;
}

/** two letters + w (.jgw, .pgw, .tfw, ...), or the generic .wld */
const WORLD_FILE_EXTENSION = /^([a-z]{2}w|wld)$/i;

export type OverlaySidecarKind = 'image' | 'pdf' | 'worldFile' | 'projection' | 'grid' | null;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

/** What role a dropped file plays in an overlay import, by extension. */
export function overlayFileKind(name: string): OverlaySidecarKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (extension === 'pdf') return 'pdf';
  if (WORLD_FILE_EXTENSION.test(extension)) return 'worldFile';
  if (extension === 'prj') return 'projection';
  if (extension === 'gsb') return 'grid';
  return null;
}

export const OVERLAY_ACCEPT = [
  ...IMAGE_EXTENSIONS.map((extension) => `.${extension}`),
  '.pdf',
  '.wld',
  '.jgw',
  '.jpw',
  '.pgw',
  '.tfw',
  '.bpw',
  '.gfw',
  '.prj',
  '.gsb',
];

export function parseWorldFile(text: string): WorldFileTransform {
  const values = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(Number);
  if (values.length < 6 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('world file must hold six numbers, one per line');
  }
  const [scaleX, skewY, skewX, scaleY, originX, originY] = values;
  return { scaleX, skewY, skewX, scaleY, originX, originY };
}

/** A world file positions pixel centers, so the image edge sits half a pixel out. */
const PIXEL_CENTER_OFFSET = 0.5;

export type Corners = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/** Image corners in the world file's coordinate system: TL, TR, BR, BL. */
export function imageCorners(
  transform: WorldFileTransform,
  width: number,
  height: number,
): Corners {
  const at = (column: number, row: number): [number, number] => [
    transform.scaleX * column + transform.skewX * row + transform.originX,
    transform.skewY * column + transform.scaleY * row + transform.originY,
  ];
  const left = -PIXEL_CENTER_OFFSET;
  const top = -PIXEL_CENTER_OFFSET;
  const right = width - PIXEL_CENTER_OFFSET;
  const bottom = height - PIXEL_CENTER_OFFSET;
  return [at(left, top), at(right, top), at(right, bottom), at(left, bottom)];
}
