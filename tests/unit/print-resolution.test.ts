import { describe, expect, it } from 'vitest';
import {
  composePage,
  fitRect,
  mapFrameMm,
  type PageSetup,
} from '../../src/features/printLayout/page';
import { printCanvasSize, printZoom } from '../../src/features/printLayout/printMap';
import { metersPerCssPixel } from '../../src/lib/scaleBar';

const A4_LANDSCAPE: PageSetup = { size: 'a4', orientation: 'landscape', marginMm: 10 };

const LEGEND = [{ name: 'Parcels', entries: [{ color: '#ff0000', label: 'low' }] }];

describe('mapFrameMm', () => {
  it('hands back the whole area inside the margins on a bare page', () => {
    expect(mapFrameMm(A4_LANDSCAPE, { title: '', legend: [] })).toEqual({
      x: 10,
      y: 10,
      width: 277,
      height: 190,
    });
  });

  it('drops below the title band and stops short of the legend column', () => {
    const frame = mapFrameMm(A4_LANDSCAPE, { title: 'Site plan', legend: LEGEND });
    expect(frame).toEqual({ x: 10, y: 22, width: 277 - 45 - 4, height: 178 });
  });

  it('is the frame the composed page letterboxes the map inside', () => {
    const content = { title: 'Site plan', legend: LEGEND };
    const frame = mapFrameMm(A4_LANDSCAPE, content);
    const elements = composePage(A4_LANDSCAPE, {
      ...content,
      camera: null,
      scaleBar: false,
      northArrow: false,
      mapSize: { width: 1000, height: 500 },
    });
    const map = elements.find((e) => e.kind === 'map');
    expect(map?.rect).toEqual(fitRect(frame, 2));
  });
});

describe('printCanvasSize', () => {
  it('measures the box in css pixels and puts the DPI in the pixel ratio', () => {
    const size = printCanvasSize(277, 138.5, 300);
    expect(size).toEqual({ cssWidth: 1047, cssHeight: 523, pixelRatio: 3.125 });
    // the point of the exercise: a 277 mm box carries its 300 DPI pixels
    expect(size.cssWidth * size.pixelRatio).toBeCloseTo((277 * 300) / 25.4, 0);
  });

  it('leaves the canvas alone at the CSS reference resolution', () => {
    expect(printCanvasSize(277, 138.5, 96).pixelRatio).toBe(1);
  });

  it('holds the pixel ratio down to what a canvas can be encoded at', () => {
    const size = printCanvasSize(400, 280, 600);
    expect(size.cssWidth * size.pixelRatio).toBeCloseTo(8192, 0);
    expect(size.pixelRatio).toBeLessThan(600 / 96);
  });

  it('survives a page box or a DPI of nothing', () => {
    expect(printCanvasSize(0, 0, 0)).toEqual({ cssWidth: 1, cssHeight: 1, pixelRatio: 1 / 96 });
  });
});

describe('printZoom', () => {
  it('leaves the zoom where it is when the canvas matches the screen', () => {
    expect(printZoom(12.5, 1000, 1000)).toBe(12.5);
  });

  it('adds a zoom level per doubling of the canvas', () => {
    expect(printZoom(12, 1000, 2000)).toBe(13);
    expect(printZoom(12, 1000, 500)).toBe(11);
  });

  it('keeps the same ground under the page as under the screen', () => {
    const latitude = 45;
    const live = { zoom: 11.3, cssWidth: 1600 };
    const print = printCanvasSize(277, 138.5, 300);
    const zoom = printZoom(live.zoom, live.cssWidth, print.cssWidth);

    expect(metersPerCssPixel(latitude, zoom) * print.cssWidth).toBeCloseTo(
      metersPerCssPixel(latitude, live.zoom) * live.cssWidth,
      6,
    );
  });

  it('stays put when the live canvas has no size to compare against', () => {
    expect(printZoom(9, 0, 1047)).toBe(9);
  });
});
