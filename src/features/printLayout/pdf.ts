import { jsPDF } from 'jspdf';
import { colorChannels } from '../symbology/symbology';
import { PAGE_SIZES_MM, type PageElement, type PageSetup } from './page';

const INK: [number, number, number] = [34, 34, 34];
const PAPER: [number, number, number] = [255, 255, 255];
const HAIRLINE_MM = 0.2;
const BAR_THICKNESS_MM = 1.2;
const TICK_MM = 2.4;
/** Text sits on its baseline, so a line's box has to be dropped by most of its height. */
const BASELINE_FRACTION = 0.75;
const ARROW_RADIUS_FRACTION = 0.4;
const ARROW_BASE_DEGREES = 140;
const ARROW_LABEL_FRACTION = 0.48;
const POINTS_PER_MM = 72 / 25.4;

export interface PdfPage {
  setup: PageSetup;
  elements: PageElement[];
  mapImage: string | null;
}

export function buildPdf(pages: PdfPage[]): jsPDF {
  const first = pages[0];
  if (!first) throw new Error('a PDF needs at least one page');

  const doc = new jsPDF({
    unit: 'mm',
    format: PAGE_SIZES_MM[first.setup.size],
    orientation: first.setup.orientation,
  });

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage(PAGE_SIZES_MM[page.setup.size], page.setup.orientation);
    drawPage(doc, page);
  });

  return doc;
}

export function downloadPdf(pages: PdfPage[], fileName: string): void {
  buildPdf(pages).save(fileName);
}

function drawPage(doc: jsPDF, page: PdfPage): void {
  for (const element of page.elements) {
    switch (element.kind) {
      case 'title':
        doc.setFontSize(element.fontSize);
        doc.setTextColor(...INK);
        doc.text(element.text, element.rect.x, element.rect.y + element.rect.height * BASELINE_FRACTION);
        break;
      case 'map':
        if (page.mapImage) {
          const { x, y, width, height } = element.rect;
          doc.addImage(page.mapImage, 'PNG', x, y, width, height);
        }
        break;
      case 'legend':
        drawLegend(doc, element);
        break;
      case 'scaleBar':
        drawScaleBar(doc, element);
        break;
      case 'northArrow':
        drawNorthArrow(doc, element);
        break;
    }
  }
}

/** The label cut to what fits on its row, since a wrapped one would run into the next. */
function oneLine(doc: jsPDF, text: string, maxWidth: number): string {
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  return lines[0] ?? text;
}

function drawLegend(doc: jsPDF, element: Extract<PageElement, { kind: 'legend' }>): void {
  const { rect, swatchSize, fontSize } = element;
  doc.setFillColor(...PAPER);
  doc.setDrawColor(...INK);
  doc.setLineWidth(HAIRLINE_MM);
  doc.rect(rect.x, rect.y, rect.width, rect.height, 'FD');

  const textLeft = rect.x + swatchSize * 2;
  for (const line of element.lines) {
    doc.setTextColor(...INK);
    if (line.kind === 'group') {
      doc.setFontSize(fontSize + 1);
      doc.setFont('helvetica', 'bold');
      const width = rect.width - swatchSize * 2;
      doc.text(oneLine(doc, line.text, width), rect.x + swatchSize, line.y + swatchSize);
      continue;
    }
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    doc.setFillColor(...(colorChannels(line.color) ?? INK));
    doc.rect(rect.x + swatchSize, line.y, swatchSize, swatchSize, 'F');
    doc.text(oneLine(doc, line.text, rect.width - swatchSize * 3), textLeft, line.y + swatchSize);
  }
  doc.setFont('helvetica', 'normal');
}

function drawScaleBar(doc: jsPDF, element: Extract<PageElement, { kind: 'scaleBar' }>): void {
  const { rect, label, fontSize } = element;
  const labelHeight = (fontSize / POINTS_PER_MM) * 1.4;
  doc.setFillColor(...PAPER);
  doc.rect(rect.x - 1, rect.y, rect.width + 2, rect.height, 'F');

  const barBottom = rect.y + rect.height;
  const tickWidth = HAIRLINE_MM * 2;
  doc.setFillColor(...INK);
  doc.rect(rect.x, barBottom - BAR_THICKNESS_MM, rect.width, BAR_THICKNESS_MM, 'F');
  doc.rect(rect.x, barBottom - TICK_MM, tickWidth, TICK_MM, 'F');
  doc.rect(rect.x + rect.width - tickWidth, barBottom - TICK_MM, tickWidth, TICK_MM, 'F');

  doc.setFontSize(fontSize);
  doc.setTextColor(...INK);
  doc.text(label, rect.x, rect.y + labelHeight);
}

function drawNorthArrow(doc: jsPDF, element: Extract<PageElement, { kind: 'northArrow' }>): void {
  const { rect, bearing } = element;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.min(rect.width, rect.height) * ARROW_RADIUS_FRACTION;
  // screen north swings the other way from the camera bearing
  const north = (-bearing * Math.PI) / 180;
  const at = (angle: number, distance: number): [number, number] => [
    centerX + distance * Math.sin(north + angle),
    centerY - distance * Math.cos(north + angle),
  ];
  const base = (ARROW_BASE_DEGREES * Math.PI) / 180;
  const [tipX, tipY] = at(0, radius);
  const [leftX, leftY] = at(base, radius);
  const [rightX, rightY] = at(-base, radius);
  const [labelX, labelY] = at(0, Math.min(rect.width, rect.height) * ARROW_LABEL_FRACTION);

  doc.setFillColor(...INK);
  doc.triangle(tipX, tipY, leftX, leftY, rightX, rightY, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('N', labelX, labelY, { align: 'center', baseline: 'middle' });
}
