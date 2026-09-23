import { jsPDF } from 'jspdf';
import type { CompSale } from '../../components/tools/CompsPanel';
import { criterionLabel, type RankedSite, type TradeAreaTable } from './siteRanking';

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface SiteReport {
  weights: string;
  tables: ReportTable[];
}

export interface MapImage {
  dataUrl: string;
  width: number;
  height: number;
}

const MISSING_VALUE = 'n/a';
const FIGURE_DECIMALS = 2;
const TOTAL_DECIMALS = 1;
const MARGIN_MM = 12;
const TITLE_FONT_SIZE = 16;
const HEADING_FONT_SIZE = 12;
const BODY_FONT_SIZE = 9;
const LINE_HEIGHT_MM = 6;
const SECTION_GAP_MM = 6;
const MAP_MAXIMUM_HEIGHT_MM = 110;
const COLUMN_GAP_MM = 4;

function figure(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: FIGURE_DECIMALS });
  }
  if (value === null || value === undefined || value === '') return MISSING_VALUE;
  return String(value);
}

function rankingTable(ranked: RankedSite[], criteria: string[]): ReportTable {
  return {
    title: 'Ranking',
    headers: ['#', 'Site', 'Score', ...criteria.map(criterionLabel)],
    rows: ranked.map((site) => [
      String(site.rank),
      site.name,
      site.total.toFixed(TOTAL_DECIMALS),
      ...criteria.map((criterion) => (site.scores[criterion] ?? 0).toFixed(0)),
    ]),
  };
}

function tradeAreasTable(tradeAreas: TradeAreaTable, ranked: RankedSite[]): ReportTable {
  const rankOf = new Map(ranked.map((site) => [site.name, site.rank]));
  // sites the shortlist does not hold go last
  const order = (site: string) => rankOf.get(site) ?? Number.POSITIVE_INFINITY;
  const rows = [...tradeAreas.rows].sort((first, second) => order(first.site) - order(second.site));
  return {
    title: 'Trade areas',
    headers: ['Site', ...tradeAreas.columns.map(criterionLabel)],
    rows: rows.map((row) => [row.site, ...tradeAreas.columns.map((column) => figure(row.values[column]))]),
  };
}

function compsTable(comps: CompSale[]): ReportTable {
  return {
    title: 'Comparable sales',
    headers: ['Address', 'Price', '$/sqft', 'Date', 'Distance'],
    rows: comps.map((comp) => [
      comp.address,
      `$${comp.salePrice.toLocaleString()}`,
      `$${comp.pricePerSqft.toFixed(0)}`,
      comp.saleDate,
      `${comp.distance.toFixed(2)} mi`,
    ]),
  };
}

export function siteReport(
  ranked: RankedSite[],
  weights: Record<string, number>,
  tradeAreas: TradeAreaTable | null,
  comps: CompSale[],
): SiteReport {
  const criteria = Object.keys(weights);
  const tables = [
    rankingTable(ranked, criteria),
    ...(tradeAreas ? [tradeAreasTable(tradeAreas, ranked)] : []),
    ...(comps.length > 0 ? [compsTable(comps)] : []),
  ];
  return {
    weights: criteria.map((criterion) => `${criterionLabel(criterion)} ${weights[criterion]}`).join(', '),
    tables,
  };
}

export function siteReportPdf(report: SiteReport, mapImage: MapImage | null, createdOn: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN_MM * 2;
  let y = MARGIN_MM;

  const makeRoom = (height: number): boolean => {
    if (y + height <= pageHeight - MARGIN_MM) return false;
    doc.addPage();
    y = MARGIN_MM;
    return true;
  };

  const writeLine = (text: string, fontSize: number, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    y += LINE_HEIGHT_MM;
    doc.text(text, MARGIN_MM, y);
  };

  writeLine('Site report', TITLE_FONT_SIZE, true);
  writeLine(createdOn, BODY_FONT_SIZE);
  writeLine(`Ranking weights: ${report.weights}`, BODY_FONT_SIZE);
  y += SECTION_GAP_MM;

  if (mapImage) {
    const aspect = mapImage.height / mapImage.width;
    const height = Math.min(contentWidth * aspect, MAP_MAXIMUM_HEIGHT_MM);
    const width = height / aspect;
    doc.addImage(mapImage.dataUrl, 'PNG', MARGIN_MM, y, width, height);
    y += height + SECTION_GAP_MM;
  }

  for (const table of report.tables) {
    makeRoom(LINE_HEIGHT_MM * 3);
    writeLine(table.title, HEADING_FONT_SIZE, true);

    doc.setFontSize(BODY_FONT_SIZE);
    doc.setFont('helvetica', 'bold');
    const naturalWidths = table.headers.map(
      (header, column) =>
        Math.max(...[header, ...table.rows.map((row) => row[column])].map((text) => doc.getTextWidth(text))) +
        COLUMN_GAP_MM,
    );
    const shrink = Math.min(1, contentWidth / naturalWidths.reduce((sum, width) => sum + width, 0));
    const widths = naturalWidths.map((width) => width * shrink);
    const starts = widths.map((_, column) =>
      widths.slice(0, column).reduce((sum, width) => sum + width, MARGIN_MM),
    );
    const writeRow = (cells: string[], bold: boolean) => {
      doc.setFontSize(BODY_FONT_SIZE);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      y += LINE_HEIGHT_MM;
      cells.forEach((cell, column) => {
        // a wrapped cell would run into the row below
        const fitted =
          shrink < 1 ? (doc.splitTextToSize(cell, widths[column] - COLUMN_GAP_MM) as string[])[0] : cell;
        doc.text(fitted ?? '', starts[column], y);
      });
    };

    writeRow(table.headers, true);
    for (const row of table.rows) {
      if (makeRoom(LINE_HEIGHT_MM)) writeRow(table.headers, true);
      writeRow(row, false);
    }
    y += SECTION_GAP_MM;
  }

  return doc;
}
