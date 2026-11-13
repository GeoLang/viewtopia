import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { angleDegrees, drawingDxf, linearLength, sheetBounds } from '../../src/features/scene/drawingSheet';
import { DrawingSheet } from '../../src/features/scene/DrawingView';
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
