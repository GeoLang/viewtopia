import type { SharedCamera } from '../../hooks/sharedCamera';
import { metersPerCssPixel, niceScaleBar } from '../../lib/scaleBar';
import type { LegendEntry } from '../symbology/symbology';

/**
 * A printed page laid out in millimetres, with the origin at the top left,
 * which is the coordinate space jsPDF draws in.
 */

export type PageSizeName = 'a4' | 'a3' | 'letter' | 'legal';
export type PageOrientation = 'portrait' | 'landscape';

/** Portrait millimetres, the form jsPDF's format array expects. */
export const PAGE_SIZES_MM: Record<PageSizeName, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};

const MIN_CONTENT_MM = 20;
const MIN_MAP_WIDTH_MM = 60;
const TITLE_BAND_MM = 12;
const TITLE_FONT_PT = 16;
const LEGEND_WIDTH_MM = 45;
const LEGEND_GAP_MM = 4;
const LEGEND_PAD_MM = 3;
const LEGEND_GROUP_MM = 6;
const LEGEND_ROW_MM = 5;
const LEGEND_SWATCH_MM = 3.5;
const LEGEND_FONT_PT = 8;
const INSET_MM = 5;
const SCALE_BAR_TARGET_MM = 40;
const SCALE_BAR_HEIGHT_MM = 8;
const SCALE_BAR_FONT_PT = 8;
const NORTH_ARROW_MM = 14;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageSetup {
  size: PageSizeName;
  orientation: PageOrientation;
  marginMm: number;
}

/** One layer's swatches, the shape the legend panel shows on screen. */
export interface LegendGroup {
  name: string;
  entries: LegendEntry[];
}

export type LegendLine =
  | { kind: 'group'; text: string; y: number }
  | { kind: 'swatch'; text: string; color: string; y: number };

export type PageElement =
  | { kind: 'title'; rect: Rect; text: string; fontSize: number }
  | { kind: 'map'; rect: Rect }
  | { kind: 'legend'; rect: Rect; lines: LegendLine[]; swatchSize: number; fontSize: number }
  | { kind: 'scaleBar'; rect: Rect; label: string; fontSize: number }
  | { kind: 'northArrow'; rect: Rect; bearing: number };

export interface PageContent {
  title: string;
  legend: LegendGroup[];
  camera: SharedCamera | null;
  scaleBar: boolean;
  northArrow: boolean;
  /** the captured map image in CSS pixels, which sets both its aspect and the page scale */
  mapSize: { width: number; height: number } | null;
}

export function pageSizeMm(setup: PageSetup): [number, number] {
  const [width, height] = PAGE_SIZES_MM[setup.size];
  return setup.orientation === 'landscape' ? [height, width] : [width, height];
}

/** The largest rect of this aspect that fits inside the frame, centred. */
export function fitRect(frame: Rect, aspect: number): Rect {
  if (!(aspect > 0)) return frame;
  const width = Math.min(frame.width, frame.height * aspect);
  const height = width / aspect;
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

function clampMargin(marginMm: number, pageWidth: number, pageHeight: number): number {
  const largest = (Math.min(pageWidth, pageHeight) - MIN_CONTENT_MM) / 2;
  return Math.max(0, Math.min(marginMm, largest));
}

function legendLines(
  groups: LegendGroup[],
  top: number,
  maxHeight: number,
): { lines: LegendLine[]; height: number } {
  const lines: LegendLine[] = [];
  const limit = top + maxHeight - LEGEND_PAD_MM;
  let y = top + LEGEND_PAD_MM;

  for (const group of groups) {
    if (y + LEGEND_GROUP_MM > limit) break;
    lines.push({ kind: 'group', text: group.name, y });
    y += LEGEND_GROUP_MM;
    for (const entry of group.entries) {
      if (y + LEGEND_ROW_MM > limit) break;
      lines.push({ kind: 'swatch', text: entry.label, color: entry.color, y });
      y += LEGEND_ROW_MM;
    }
  }

  return { lines, height: y - top + LEGEND_PAD_MM };
}

/**
 * Everything the page draws, in the order it draws: the map image first, then
 * whatever sits over it. The map keeps the captured image's aspect, so a page
 * shaped unlike the viewer letterboxes rather than stretching the world.
 */
export function composePage(setup: PageSetup, content: PageContent): PageElement[] {
  const [pageWidth, pageHeight] = pageSizeMm(setup);
  const margin = clampMargin(setup.marginMm, pageWidth, pageHeight);
  const left = margin;
  const width = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  const elements: PageElement[] = [];

  let top = margin;
  const title = content.title.trim();
  if (title) {
    elements.push({
      kind: 'title',
      rect: { x: left, y: top, width, height: TITLE_BAND_MM },
      text: title,
      fontSize: TITLE_FONT_PT,
    });
    top += TITLE_BAND_MM;
  }

  const hasLegend =
    content.legend.some((group) => group.entries.length > 0) &&
    width - LEGEND_WIDTH_MM - LEGEND_GAP_MM >= MIN_MAP_WIDTH_MM;
  const frameHeight = bottom - top;
  const frame: Rect = {
    x: left,
    y: top,
    width: hasLegend ? width - LEGEND_WIDTH_MM - LEGEND_GAP_MM : width,
    height: frameHeight,
  };
  const aspect = content.mapSize ? content.mapSize.width / content.mapSize.height : 0;
  const map = fitRect(frame, aspect);
  elements.push({ kind: 'map', rect: map });

  if (hasLegend) {
    const { lines, height } = legendLines(content.legend, top, frameHeight);
    elements.push({
      kind: 'legend',
      rect: {
        x: left + width - LEGEND_WIDTH_MM,
        y: top,
        width: LEGEND_WIDTH_MM,
        height: Math.min(height, frameHeight),
      },
      lines,
      swatchSize: LEGEND_SWATCH_MM,
      fontSize: LEGEND_FONT_PT,
    });
  }

  if (content.scaleBar && content.camera && content.mapSize) {
    const groundMeters =
      metersPerCssPixel(content.camera.latitude, content.camera.zoom) * content.mapSize.width;
    const bar = niceScaleBar(groundMeters / map.width, SCALE_BAR_TARGET_MM);
    if (bar.length > 0) {
      elements.push({
        kind: 'scaleBar',
        rect: {
          x: map.x + INSET_MM,
          y: map.y + map.height - INSET_MM - SCALE_BAR_HEIGHT_MM,
          width: bar.length,
          height: SCALE_BAR_HEIGHT_MM,
        },
        label: bar.label,
        fontSize: SCALE_BAR_FONT_PT,
      });
    }
  }

  if (content.northArrow && content.camera) {
    elements.push({
      kind: 'northArrow',
      rect: {
        x: map.x + map.width - INSET_MM - NORTH_ARROW_MM,
        y: map.y + INSET_MM,
        width: NORTH_ARROW_MM,
        height: NORTH_ARROW_MM,
      },
      bearing: content.camera.bearing,
    });
  }

  return elements;
}
