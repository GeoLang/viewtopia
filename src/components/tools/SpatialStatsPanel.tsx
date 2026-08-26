import { useMemo, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Select,
  Textarea,
  Slider,
  Button,
  Code,
} from '@mantine/core';
import { IconChartDots } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  DEFAULT_CELL_METERS,
  MAX_CELL_METERS,
  MIN_CELL_METERS,
  SPATIAL_STATS_GROUP,
  formatCellValue,
  showSpatialStatsGrid,
} from '../../features/analysis/spatialStats';
import { useDrawStore } from '../../store/draw';
import { useColumnLabels } from '../../store/datasetSchemas';
import {
  collectPoints,
  pointsFromDraw,
  drawLayerOptions,
  numericProperties,
  clearPanelDeckLayer,
  type GridAggregation,
  type PointRecord,
} from '../../lib/pointData';

const CELL_METERS_STEP = 50;

export function SpatialStatsPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const [method, setMethod] = useState<GridAggregation>('count');
  const [property, setProperty] = useState<string | null>(null);
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_METERS);
  const [source, setSource] = useState<string>('pasted');
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const { columnOptions } = useColumnLabels();

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
    const { summary, label } = showSpatialStatsGrid(points, method, property, cellSize);
    setResult(
      `points: ${summary.total}\ncells: ${summary.cells}\nmethod: ${label}\nmin/cell: ${formatCellValue(summary.min)}\nmax/cell: ${formatCellValue(summary.max)}`,
    );
  };

  const clear = () => {
    clearPanelDeckLayer(SPATIAL_STATS_GROUP);
    setResult('Cleared');
  };

  return (
    <PanelCard width={280}>
      <PanelHeader
        icon={<IconChartDots size={16} />}
        title="Spatial Statistics"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Select
          size="xs"
          label="Data Source"
          data={sourceData}
          value={source}
          onChange={(v) => v && setSource(v)}
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
          onChange={(v) => v && setMethod(v as GridAggregation)}
        />

        {method !== 'count' && (
          <Select
            size="xs"
            label="Numeric Property"
            placeholder="pick property"
            data={columnOptions(propertyOptions)}
            value={property}
            onChange={setProperty}
          />
        )}

        <Text size="xs" c="dimmed">Cell Size: {cellSize} m</Text>
        <Slider
          size="xs"
          min={MIN_CELL_METERS}
          max={MAX_CELL_METERS}
          step={CELL_METERS_STEP}
          value={cellSize}
          onChange={setCellSize}
          color="violet"
        />

        <Group gap="xs" grow>
          <Button size="xs" color="violet" onClick={run}>Run</Button>
          <Button size="xs" variant="subtle" color="gray" onClick={clear}>Clear</Button>
        </Group>

        {result && (
          <Code block data-testid="spatialstats-result">{result}</Code>
        )}
      </Stack>
    </PanelCard>
  );
}
