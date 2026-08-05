import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  SegmentedControl,
  Select,
  NumberInput,
} from '@mantine/core';
import { IconCube, IconX } from '@tabler/icons-react';
import { Cartographic, EllipsoidTerrainProvider, sampleTerrainMostDetailed } from 'cesium';
import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { useDrawStore } from '../../store/draw';

type BaseMode = 'min' | 'mean' | 'custom';

const GRID = 64;
const M_PER_DEG_LAT = 111_320;

const TERRAIN_NOTICE =
  'The globe is on the default ellipsoid, so every sampled height is 0. Enable a terrain source in the Global Terrain panel, then measure again.';

interface VolumeResult {
  cut: number;
  fill: number;
  net: number;
  base: number;
  cells: number;
  area: number;
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

/** even-odd crossing test, ring may be open or closed */
function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonGrid(ring: [number, number][]): {
  cells: [number, number][];
  cellArea: number;
} {
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const stepLng = (maxLng - minLng) / GRID;
  const stepLat = (maxLat - minLat) / GRID;
  const midLat = (minLat + maxLat) / 2;
  const cellArea =
    stepLat * M_PER_DEG_LAT * stepLng * M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);

  const cells: [number, number][] = [];
  for (let row = 0; row < GRID; row++) {
    const lat = minLat + (row + 0.5) * stepLat;
    for (let col = 0; col < GRID; col++) {
      const lng = minLng + (col + 0.5) * stepLng;
      if (pointInRing(lng, lat, ring)) cells.push([lng, lat]);
    }
  }
  return { cells, cellArea };
}

export function cutFill(
  heights: number[],
  cellArea: number,
  base: number,
): { cut: number; fill: number; net: number } {
  let cut = 0;
  let fill = 0;
  for (const h of heights) {
    const d = h - base;
    if (d > 0) cut += d * cellArea;
    else fill -= d * cellArea;
  }
  return { cut, fill, net: cut - fill };
}

function baseHeight(mode: BaseMode, custom: number, heights: number[]): number {
  if (mode === 'custom') return custom;
  if (mode === 'mean') return heights.reduce((a, b) => a + b, 0) / heights.length;
  return heights.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
}

function formatM3(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 1 : 3;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} m³`;
}

export function VolumePanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const features = useDrawStore((s) => s.features);
  const drawMode = useDrawStore((s) => s.mode);
  const setMode = useDrawStore((s) => s.setMode);
  const polygons = features.filter((f) => f.type === 'Polygon');
  const drawing = drawMode === 'polygon';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseMode, setBaseMode] = useState<BaseMode>('min');
  const [customBase, setCustomBase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<VolumeResult | null>(null);

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  // a polygon finishing while we armed drawing becomes the measured region
  const prevCount = useRef(polygons.length);
  useEffect(() => {
    if (drawing && polygons.length > prevCount.current) {
      setSelectedId(polygons[polygons.length - 1].id);
      setMode(null);
    }
    prevCount.current = polygons.length;
  }, [drawing, polygons, setMode]);

  const active = polygons.find((f) => f.id === selectedId) ?? polygons[polygons.length - 1];

  const measure = async () => {
    if (!viewer || !active) return;
    setError(null);
    setNotice(null);
    if (viewer.terrainProvider instanceof EllipsoidTerrainProvider) {
      setResult(null);
      setNotice(TERRAIN_NOTICE);
      return;
    }
    const { cells, cellArea } = polygonGrid(active.coords);
    if (cells.length === 0 || !(cellArea > 0)) {
      setResult(null);
      setError('That polygon encloses no area. Draw a wider region.');
      return;
    }
    setBusy(true);
    try {
      const sampled = await sampleTerrainMostDetailed(
        viewer.terrainProvider,
        cells.map(([lng, lat]) => Cartographic.fromDegrees(lng, lat)),
      );
      const heights = sampled.map((c) => c.height);
      const base = baseHeight(baseMode, customBase, heights);
      setResult({
        ...cutFill(heights, cellArea, base),
        base,
        cells: cells.length,
        area: cells.length * cellArea,
      });
    } catch (e) {
      setResult(null);
      setError(`Terrain sampling failed: ${firstLine(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: ReactNode) => (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconCube size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Volume Measurement
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="volume-no-cesium">
        Volume measurement needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  return shell(
    <Stack gap="xs">
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          label="Region"
          flex={1}
          placeholder={polygons.length ? 'Latest drawn polygon' : 'No drawn polygons yet'}
          data={polygons.map((f, i) => ({ value: f.id, label: `Polygon #${i + 1}` }))}
          value={active?.id ?? null}
          onChange={setSelectedId}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Button
          size="xs"
          variant={drawing ? 'light' : 'default'}
          color="violet"
          onClick={() => setMode(drawing ? null : 'polygon')}
        >
          {drawing ? 'Cancel' : 'Draw'}
        </Button>
      </Group>

      {drawing && (
        <Text size="xs" c="dimmed" ta="center">
          Click points on the map, double-click to close the polygon.
        </Text>
      )}

      <SegmentedControl
        size="xs"
        fullWidth
        value={baseMode}
        onChange={(v) => setBaseMode(v as BaseMode)}
        data={[
          { value: 'min', label: 'Min' },
          { value: 'mean', label: 'Mean' },
          { value: 'custom', label: 'Custom' },
        ]}
      />

      {baseMode === 'custom' && (
        <NumberInput
          size="xs"
          label="Base height (m)"
          value={customBase}
          onChange={(v) => setCustomBase(Number(v) || 0)}
          step={1}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
      )}

      <Button
        size="xs"
        color="violet"
        onClick={() => void measure()}
        loading={busy}
        disabled={!active}
        fullWidth
      >
        Measure
      </Button>

      {notice && (
        <Text size="xs" c="yellow" data-testid="volume-terrain-notice">
          {notice}
        </Text>
      )}

      {error && (
        <Text size="xs" c="red" data-testid="volume-error">
          {error}
        </Text>
      )}

      {result && (
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Cut
            </Text>
            <Badge size="xs" color="red" data-testid="volume-cut">
              {formatM3(result.cut)}
            </Badge>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Fill
            </Text>
            <Badge size="xs" color="green" data-testid="volume-fill">
              {formatM3(result.fill)}
            </Badge>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Net
            </Text>
            <Badge size="xs" color="violet" data-testid="volume-net">
              {formatM3(result.net)}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" data-testid="volume-detail">
            {`base ${result.base.toFixed(1)} m · ${result.cells} cells · ${Math.round(result.area).toLocaleString('en-US')} m²`}
          </Text>
        </Stack>
      )}

      {!result && !notice && !error && (
        <Text size="xs" c="dimmed" ta="center">
          Draw a polygon on the terrain, then measure cut and fill against a base height.
        </Text>
      )}
    </Stack>,
  );
}
