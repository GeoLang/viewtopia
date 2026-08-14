import { beforeEach, describe, expect, it, vi } from 'vitest';

const { doc, jsPDF } = vi.hoisted(() => {
  const doc = {
    addPage: vi.fn(),
    addImage: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    triangle: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    save: vi.fn(),
  };
  // `new jsPDF(...)` needs a constructable stub, which an arrow function is not
  return {
    doc,
    jsPDF: vi.fn(function stub() {
      return doc;
    }),
  };
});

vi.mock('jspdf', () => ({ jsPDF }));

import { composePage, type PageSetup } from '../../src/features/printLayout/page';
import { buildPdf, downloadPdf, type PdfPage } from '../../src/features/printLayout/pdf';

const SETUP: PageSetup = { size: 'a4', orientation: 'landscape', marginMm: 10 };

function page(title: string): PdfPage {
  return {
    setup: SETUP,
    elements: composePage(SETUP, {
      title,
      legend: [{ name: 'Parcels', entries: [{ color: '#ff8800', label: 'low' }] }],
      camera: { longitude: 0, latitude: 0, zoom: 10, pitch: 0, bearing: 30 },
      scaleBar: true,
      northArrow: true,
      mapSize: { width: 1000, height: 500 },
    }),
    mapImage: `data:image/png;base64,${title}`,
  };
}

describe('buildPdf', () => {
  beforeEach(() => {
    for (const fn of [jsPDF, ...Object.values(doc)]) fn.mockClear();
  });

  it('refuses a document with no pages', () => {
    expect(() => buildPdf([])).toThrow(/at least one page/);
  });

  it('opens the document in millimetres at the page size and orientation', () => {
    buildPdf([page('one')]);
    expect(jsPDF).toHaveBeenCalledWith({ unit: 'mm', format: [210, 297], orientation: 'landscape' });
    expect(doc.addPage).not.toHaveBeenCalled();
  });

  it('adds a page per atlas entry beyond the first and draws each map image', () => {
    buildPdf([page('one'), page('two'), page('three')]);

    expect(doc.addPage).toHaveBeenCalledTimes(2);
    expect(doc.addPage).toHaveBeenCalledWith([210, 297], 'landscape');
    expect(doc.addImage.mock.calls.map(([data]) => data)).toEqual([
      'data:image/png;base64,one',
      'data:image/png;base64,two',
      'data:image/png;base64,three',
    ]);
  });

  it('draws the page furniture: title, legend swatch, scale bar label and north arrow', () => {
    buildPdf([page('Site plan')]);

    const drawn = doc.text.mock.calls.map(([text]) => text);
    expect(drawn).toContain('Site plan');
    expect(drawn).toContain('Parcels');
    expect(drawn).toContain('low');
    expect(drawn).toContain('N');
    expect(drawn).toContain('50 km');
    expect(doc.triangle).toHaveBeenCalledTimes(1);
    // the swatch colour reaches the document as channels, not as a css string
    expect(doc.setFillColor).toHaveBeenCalledWith(255, 136, 0);
  });

  it('saves under the name it was given', () => {
    downloadPdf([page('one')], 'viewtopia-atlas.pdf');
    expect(doc.save).toHaveBeenCalledWith('viewtopia-atlas.pdf');
  });
});
