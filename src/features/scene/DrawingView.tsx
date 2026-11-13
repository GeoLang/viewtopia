import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from '../elements/elementService';
import type { ClipAxis } from './clipping';
import {
  angleDegrees,
  drawingDxf,
  linearLength,
  sheetBounds,
  type AngleDimension,
  type LinearDimension,
  type PaperLine,
  type SheetBounds,
} from './drawingSheet';

type DimensionMode = 'linear' | 'angle';

async function fetchDrawing(
  assetId: string,
  { axis, position, flip }: { axis: ClipAxis; position: number | null; flip: boolean },
  signal: AbortSignal,
): Promise<PaperLine[]> {
  if (!getAuthToken()) throw new ElementApiError('Sign in to draw this model.', 401, null);
  const query = new URLSearchParams({ axis, flip: String(flip) });
  if (position !== null) query.set('position', String(position));
  const response = await fetch(`/v1/assets/${encodeURIComponent(assetId)}/drawing?${query}`, {
    headers: authHeaders(),
    signal,
  });
  noticeRefusal(response.status);
  if (!response.ok) {
    const body = errorBodyOf(await response.text());
    throw new ElementApiError(body?.message ?? `tiletopia answered HTTP ${response.status}.`, response.status, body?.code ?? null);
  }
  const drawing = (await response.json()) as { lines: PaperLine[] };
  return drawing.lines;
}

export function DrawingSheet({
  lines,
  linear,
  angles,
  bounds,
  onSheetClick,
}: {
  lines: readonly PaperLine[];
  linear: readonly LinearDimension[];
  angles: readonly AngleDimension[];
  bounds: SheetBounds;
  onSheetClick: (event: MouseEvent<SVGSVGElement>) => void;
}) {
  const width = bounds.max[0] - bounds.min[0] || 1;
  const height = bounds.max[1] - bounds.min[1] || 1;
  const stroke = width / 200;
  return (
    <svg
      data-testid="drawing-sheet"
      aria-label="Drawing"
      viewBox={`${bounds.min[0]} ${-bounds.max[1]} ${width} ${height}`}
      style={{ width: '100%', height: 180, background: '#f4f1ea', border: '1px solid #c8c2b4' }}
      onClick={onSheetClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.focus();
      }}
    >
      <title>Drawing</title>
      <g data-testid="drawing-lines" transform="scale(1,-1)">
        {lines.map((line, index) => (
          <line
            key={index}
            x1={line.paperStart[0]}
            y1={line.paperStart[1]}
            x2={line.paperEnd[0]}
            y2={line.paperEnd[1]}
            stroke={line.hidden ? '#8a847a' : '#1c1a17'}
            strokeDasharray={line.hidden ? '0.15 0.1' : undefined}
            strokeWidth={stroke}
          />
        ))}
        {linear.map((dimension, index) => (
          <line
            key={`length-${index}`}
            x1={dimension.start[0]}
            y1={dimension.start[1]}
            x2={dimension.end[0]}
            y2={dimension.end[1]}
            stroke="#6a3e16"
            strokeWidth={width / 160}
          />
        ))}
      </g>
      {linear.map((dimension, index) => (
        <text
          key={`length-label-${index}`}
          data-testid="drawing-dimension"
          x={(dimension.start[0] + dimension.end[0]) / 2}
          y={-((dimension.start[1] + dimension.end[1]) / 2)}
          fill="#6a3e16"
          fontSize={width / 24}
        >
          {linearLength(dimension).toFixed(2)} m
        </text>
      ))}
      {angles.map((dimension, index) => (
        <text
          key={`angle-${index}`}
          data-testid="drawing-angle"
          x={dimension.corner[0]}
          y={-dimension.corner[1]}
          fill="#6a3e16"
          fontSize={width / 24}
        >
          {angleDegrees(dimension).toFixed(1)}°
        </text>
      ))}
    </svg>
  );
}

function downloadDxf(name: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/dxf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function DrawingView({
  assetId,
  axis,
  position,
  flip,
}: {
  assetId: string;
  axis: ClipAxis;
  position: number | null;
  flip: boolean;
}) {
  const [lines, setLines] = useState<PaperLine[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [mode, setMode] = useState<DimensionMode>('linear');
  const [pending, setPending] = useState<[number, number][]>([]);
  const [linear, setLinear] = useState<LinearDimension[]>([]);
  const [angles, setAngles] = useState<AngleDimension[]>([]);
  const bounds = lines ? sheetBounds(lines) : null;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setReading(true);
    setFailure(null);
    fetchDrawing(assetId, { axis, position, flip }, controller.signal)
      .then((drawn) => {
        setLines(drawn);
        setLinear([]);
        setAngles([]);
        setPending([]);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setFailure(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setReading(false));
  };

  const onSheetClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!bounds) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = bounds.max[0] - bounds.min[0] || 1;
    const height = bounds.max[1] - bounds.min[1] || 1;
    const point: [number, number] = [
      bounds.min[0] + ((event.clientX - rect.left) / rect.width) * width,
      bounds.max[1] - ((event.clientY - rect.top) / rect.height) * height,
    ];
    const next = [...pending, point];
    const needed = mode === 'linear' ? 2 : 3;
    if (next.length < needed) {
      setPending(next);
      return;
    }
    if (mode === 'linear') setLinear((current) => [...current, { start: next[0], end: next[1] }]);
    else setAngles((current) => [...current, { start: next[0], corner: next[1], end: next[2] }]);
    setPending([]);
  };

  return (
    <Stack gap={4}>
      <Button size="xs" variant="light" color="violet" onClick={load} loading={reading}>
        {position === null ? 'Project the model' : 'Project this cut'}
      </Button>
      {failure && (
        <Text size="xs" c="red" data-testid="drawing-error">
          {failure}
        </Text>
      )}
      {lines && lines.length === 0 && (
        <Text size="xs" c="dimmed">
          The projection has no edges.
        </Text>
      )}
      {bounds && lines && (
        <>
          <Group gap={4}>
            <Button size="compact-xs" variant={mode === 'linear' ? 'filled' : 'light'} onClick={() => { setMode('linear'); setPending([]); }}>
              Length
            </Button>
            <Button size="compact-xs" variant={mode === 'angle' ? 'filled' : 'light'} onClick={() => { setMode('angle'); setPending([]); }}>
              Angle
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {mode === 'linear' ? 'Click two points for a length.' : 'Click the first arm, the corner, then the second arm.'}
          </Text>
          <DrawingSheet
            lines={lines}
            linear={linear}
            angles={angles}
            bounds={bounds}
            onSheetClick={onSheetClick}
          />
          <Button
            size="xs"
            variant="light"
            color="violet"
            onClick={() =>
              downloadDxf(
                'drawing.dxf',
                drawingDxf({ lines, linear, angles, title: `Drawing ${axis.toUpperCase()}` }),
              )
            }
          >
            Download DXF
          </Button>
        </>
      )}
    </Stack>
  );
}
