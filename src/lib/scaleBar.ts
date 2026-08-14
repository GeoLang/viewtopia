/** Web mercator ground metres per pixel at the equator, zoom 0. */
const EQUATOR_METERS_PER_PIXEL = 156_543.03392;

/** Ground metres one CSS pixel covers at this latitude and zoom. */
export function metersPerCssPixel(latitude: number, zoom: number): number {
  return (EQUATOR_METERS_PER_PIXEL * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * A round distance near the target length, and how long it draws in whatever
 * unit `metersPerUnit` is given in: pixels for an image, millimetres for a page.
 */
export function niceScaleBar(
  metersPerUnit: number,
  targetLength: number,
): { label: string; length: number } {
  if (!(metersPerUnit > 0) || !(targetLength > 0)) return { label: '', length: 0 };
  const raw = metersPerUnit * targetLength;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw) ?? pow * 10;
  const label = nice >= 1000 ? `${(nice / 1000).toLocaleString()} km` : `${nice} m`;
  return { label, length: nice / metersPerUnit };
}
