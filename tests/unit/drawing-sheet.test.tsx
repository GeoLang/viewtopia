import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useAuthStore } from '../../src/features/auth/store';
import { angleDegrees, drawingDxf, linearLength, sheetBounds } from '../../src/features/scene/drawingSheet';
import { DrawingSheet, DrawingView } from '../../src/features/scene/DrawingView';
import type { PaperLine } from '../../src/features/scene/drawingSheet';

const line = (hidden: boolean, start: [number, number], end: [number, number]): PaperLine => ({
  elementId: 'wall',
  hidden,
  paperStart: start,
  paperEnd: end,
});

describe('drawing measurements', () => {
  it('measures a 3-4-5 length', () => {
    expect(linearLength({ start: [0, 0], end: [3, 4] })).toBe(5);
  });

  it('reports the smaller angle, including a straight line and a zero turn', () => {
    expect(angleDegrees({ corner: [0, 0], start: [1, 0], end: [0, 1] })).toBeCloseTo(90);
    expect(angleDegrees({ corner: [0, 0], start: [1, 0], end: [0, -1] })).toBeCloseTo(90);
    expect(angleDegrees({ corner: [0, 0], start: [1, 0], end: [-1, 0] })).toBeCloseTo(180);
    expect(angleDegrees({ corner: [0, 0], start: [2, 0], end: [4, 0] })).toBeCloseTo(0);
  });

  it('bounds every endpoint and returns nothing for an empty sheet', () => {
    expect(sheetBounds([])).toBeNull();
    expect(sheetBounds([line(false, [1, -2], [4, 3])])).toEqual({ min: [1, -2], max: [4, 3] });
  });
});

describe('drawingDxf', () => {
  const dxf = drawingDxf({
    lines: [line(false, [0, 0], [2, 0]), line(true, [0, 0], [0, 2])],
    linear: [{ start: [0, 0], end: [3, 4] }],
    angles: [{ corner: [0, 0], start: [1, 0], end: [0, 1] }],
    title: 'Plan\nA',
  });

  it('writes metres, a sheet, visible and hidden lines, and dimensions', () => {
    expect(dxf).toContain('$INSUNITS\n70\n6');
    expect(dxf).toContain('8\nVISIBLE');
    expect(dxf).toContain('8\nHIDDEN');
    expect(dxf).toContain('8\nDIMENSION');
    expect(dxf).toContain('8\nSHEET');
    expect(dxf).toContain('5.00 m');
    expect(dxf).toContain('90.0 deg');
    expect(dxf).toContain('0\nEOF\n');
  });

  it('keeps a newline in the title from starting a new entity', () => {
    expect(dxf).toContain('1\nPlan A\n');
    expect(dxf).not.toContain('Plan\nA');
  });
});

describe('DrawingSheet', () => {
  it('draws model lines in the flipped group and leaves dimension text upright', () => {
    render(
      <DrawingSheet
        lines={[line(false, [0, 0], [2, 0])]}
        linear={[{ start: [0, 0], end: [3, 4] }]}
        angles={[{ corner: [1, 2], start: [2, 2], end: [1, 3] }]}
        bounds={{ min: [0, 0], max: [4, 4] }}
        onSheetClick={() => undefined}
      />,
    );

    const modelLines = screen.getByTestId('drawing-lines');
    expect(modelLines.getAttribute('transform')).toBe('scale(1,-1)');
    expect(modelLines.querySelectorAll('line').length).toBe(2);

    const length = screen.getByTestId('drawing-dimension');
    expect(length.parentElement).not.toBe(modelLines);
    expect(length.getAttribute('y')).toBe('-2');

    const angle = screen.getByTestId('drawing-angle');
    expect(angle.getAttribute('y')).toBe('-2');
    expect(angle.textContent).toBe('90.0°');
  });
});

// jsdom has no layout, so the screen transform of a 50 by 10 m sheet in a 300 by 180 px svg is given here
const SHEET_RECT = { left: 0, top: 0, width: 300, height: 180 };
// xMidYMid meet scales by min(300 / 50, 180 / 10) = 6 and centres the 60 px tall drawing, 60 px from the top
const SCREEN_TO_SHEET = { a: 1 / 6, b: 0, c: 0, d: 1 / 6, e: 0, f: -20 };

class FakeDomPoint {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
  matrixTransform({ a, b, c, d, e, f }: typeof SCREEN_TO_SHEET) {
    return new FakeDomPoint(a * this.x + c * this.y + e, b * this.x + d * this.y + f);
  }
}

describe('DrawingView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures clicks on a letterboxed sheet in drawing metres', async () => {
    const lines = [line(false, [0, 0], [50, 0]), line(false, [50, 0], [50, 10]), line(false, [0, 10], [0, 0])];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ lines }) })),
    );
    vi.stubGlobal('DOMPoint', FakeDomPoint);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
    render(
      <MantineProvider env="test">
        <DrawingView assetId="a1b2" axis="z" position={null} flip={false} />
      </MantineProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Project the model' }));
    });
    const sheet = screen.getByTestId('drawing-sheet');
    Object.assign(sheet, {
      getBoundingClientRect: () => SHEET_RECT,
      getScreenCTM: () => ({ inverse: () => SCREEN_TO_SHEET }),
    });

    fireEvent.click(sheet, { clientX: 0, clientY: 120 });
    fireEvent.click(sheet, { clientX: 0, clientY: 60 });

    expect(screen.getByTestId('drawing-dimension').textContent).toBe('10.00 m');
  });
});
