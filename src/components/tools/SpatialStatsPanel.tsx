import { useMemo, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Textarea,
  Slider,
  Button,
  Code,
} from '@mantine/core';
import { IconChartDots, IconX } from '@tabler/icons-react';
import { GridLayer } from '@deck.gl/aggregation-layers';
import { useDrawStore } from '../../store/draw';
import {
  collectPoints,
  pointsFromDraw,
  drawLayerOptions,
  numericProperties,
  showPanelDeckLayer,
  clearPanelDeckLayer,
  type PointRecord,
} from '../../lib/pointData';

const GROUP = 'panel-spatialstats';

const AGG: Record<string, 'COUNT' | 'SUM' | 'MEAN'> = {
  count: 'COUNT',
  sum: 'SUM',
  mean: 'MEAN',
};

/** Bin points into a rough metric grid to summarise per-cell counts. */
function gridSummary(points: PointRecord[], cellMeters: number) {
  if (points.length === 0) return { total: 0, cells: 0, min: 0, max: 0 };
  const avgLat = points.reduce((s, p) => s + p.position[1], 0) / points.length;
  const latDeg = cellMeters / 111320;
  const lngDeg = cellMeters / (111320 * Math.cos((avgLat * Math.PI) / 180) || 1);
  const counts = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor(p.position[0] / lngDeg)}_${Math.floor(p.position[1] / latDeg)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const values = [...counts.values()];
  return {
    total: points.length,
    cells: counts.size,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function SpatialStatsPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const [method, setMethod] = useState<string>('count');
  const [property, setProperty] = useState<string | null>(null);
  const [cellSize, setCellSize] = useState(500);
  const [source, setSource] = useState<string>('pasted');
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const sourceData = [
    { value: 'pasted', label: 'Pasted GeoJSON' },
    ...drawLayerOptions(features),
  ];

  const gatherPoints = (): PointRecord[] => {
    if (source === 'pasted') {
      try {
        return collectPoints(JSON.parse(pasted));
      } catch {
        return [];
      }
    }
    return pointsFromDraw(source);
  };

  const propertyOptions = useMemo(
    () => numericProperties(gatherPoints()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, pasted, features],
  );

  const run = () => {
    const points = gatherPoints();
    if (points.length === 0) {
      setResult('No points found in source');
      return;
    }
    const agg = AGG[method];
    showPanelDeckLayer(
      GROUP,
      new GridLayer<PointRecord>({
        id: `panel-grid-${Date.now()}`,
        data: points,
        getPosition: (d) => d.position,
        getColorWeight: (d) => (property ? Number(d.properties[property]) || 0 : 1),
        colorAggregation: agg,
        getElevationWeight: (d) => (property ? Number(d.properties[property]) || 0 : 1),
        elevationAggregation: agg,
        cellSize,
        extruded: true,
        pickable: true,
      }),
    );
    const s = gridSummary(points, cellSize);
    setResult(
      `points: ${s.total}\ncells: ${s.cells}\nmin/cell: ${s.min}\nmax/cell: ${s.max}`,
    );
  };

  const clear = () => {
    clearPanelDeckLayer(GROUP);
    setResult('Cleared');
  };

  return (
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
          <IconChartDots size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Spatial Statistics
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Data Source"
          data={sourceData}
          value={source}
          onChange={(v) => v && setSource(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {source === 'pasted' && (
          <Textarea
            size="xs"
            label="GeoJSON"
            placeholder='{"type":"FeatureCollection","features":[…]}'
            autosize
            minRows={2}
            maxRows={5}
            value={pasted}
            onChange={(e) => setPasted(e.currentTarget.value)}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
        )}

        <Select
          size="xs"
          label="Aggregation"
          data={[
            { value: 'count', label: 'Count' },
            { value: 'sum', label: 'Sum' },
            { value: 'mean', label: 'Mean' },
          ]}
          value={method}
          onChange={(v) => v && setMethod(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {method !== 'count' && (
          <Select
            size="xs"
            label="Numeric Property"
            placeholder="pick property"
            data={propertyOptions}
            value={property}
            onChange={setProperty}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
        )}

        <Text size="xs" c="dimmed">Cell Size: {cellSize} m</Text>
        <Slider size="xs" min={50} max={5000} step={50} value={cellSize} onChange={setCellSize} color="violet" />

        <Group gap="xs" grow>
          <Button size="xs" color="violet" onClick={run}>Run</Button>
          <Button size="xs" variant="subtle" color="gray" onClick={clear}>Clear</Button>
        </Group>

        {result && (
          <Code block data-testid="spatialstats-result">{result}</Code>
        )}
      </Stack>
    </Paper>
  );
}
