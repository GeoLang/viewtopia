export interface PaperLine {
  elementId: string;
  hidden: boolean;
  paperStart: [number, number];
  paperEnd: [number, number];
}

export interface LinearDimension {
  start: [number, number];
  end: [number, number];
}

export interface AngleDimension {
  corner: [number, number];
  start: [number, number];
  end: [number, number];
}

export interface SheetBounds {
  min: [number, number];
  max: [number, number];
}

export function sheetBounds(lines: readonly PaperLine[]): SheetBounds | null {
  let bounds: SheetBounds | null = null;
  for (const line of lines) {
    for (const point of [line.paperStart, line.paperEnd]) {
      bounds = bounds
        ? {
            min: [Math.min(bounds.min[0], point[0]), Math.min(bounds.min[1], point[1])],
            max: [Math.max(bounds.max[0], point[0]), Math.max(bounds.max[1], point[1])],
          }
        : { min: [...point], max: [...point] };
    }
  }
  return bounds;
}

export function linearLength(dimension: LinearDimension): number {
  const dx = dimension.end[0] - dimension.start[0];
  const dy = dimension.end[1] - dimension.start[1];
  return Math.hypot(dx, dy);
}

export function angleDegrees(dimension: AngleDimension): number {
  const start = Math.atan2(dimension.start[1] - dimension.corner[1], dimension.start[0] - dimension.corner[0]);
  const end = Math.atan2(dimension.end[1] - dimension.corner[1], dimension.end[0] - dimension.corner[0]);
  const turn = Math.abs(end - start);
  const smallest = Math.min(turn, Math.PI * 2 - turn);
  return (smallest * 180) / Math.PI;
}

function dxfLine(layer: string, start: [number, number], end: [number, number]): string {
  return `0\nLINE\n8\n${layer}\n10\n${start[0]}\n20\n${start[1]}\n30\n0\n11\n${end[0]}\n21\n${end[1]}\n31\n0\n`;
}

function dxfText(layer: string, at: [number, number], text: string): string {
  const escaped = text.replaceAll('\n', ' ');
  return `0\nTEXT\n8\n${layer}\n10\n${at[0]}\n20\n${at[1]}\n30\n0\n40\n0.25\n1\n${escaped}\n`;
}

export function drawingDxf({
  lines,
  linear,
  angles,
  title,
}: {
  lines: readonly PaperLine[];
  linear: readonly LinearDimension[];
  angles: readonly AngleDimension[];
  title: string;
}): string {
  const bounds = sheetBounds(lines) ?? { min: [0, 0], max: [1, 1] };
  const margin = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], 1) * 0.08;
  const frame: [number, number][] = [
    [bounds.min[0] - margin, bounds.min[1] - margin],
    [bounds.max[0] + margin, bounds.min[1] - margin],
    [bounds.max[0] + margin, bounds.max[1] + margin],
    [bounds.min[0] - margin, bounds.max[1] + margin],
  ];
  let entities = '';
  for (let index = 0; index < frame.length; index += 1) {
    entities += dxfLine('SHEET', frame[index], frame[(index + 1) % frame.length]);
  }
  entities += dxfText('SHEET', [frame[0][0], frame[0][1] - margin], title);
  for (const line of lines) {
    entities += dxfLine(line.hidden ? 'HIDDEN' : 'VISIBLE', line.paperStart, line.paperEnd);
  }
  for (const dimension of linear) {
    entities += dxfLine('DIMENSION', dimension.start, dimension.end);
    entities += dxfText(
      'DIMENSION',
      [(dimension.start[0] + dimension.end[0]) / 2, (dimension.start[1] + dimension.end[1]) / 2],
      `${linearLength(dimension).toFixed(2)} m`,
    );
  }
  for (const dimension of angles) {
    entities += dxfLine('DIMENSION', dimension.corner, dimension.start);
    entities += dxfLine('DIMENSION', dimension.corner, dimension.end);
    entities += dxfText('DIMENSION', dimension.corner, `${angleDegrees(dimension).toFixed(1)} deg`);
  }
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}
