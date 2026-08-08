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
import { GridLayer } from '@deck.gl/aggregation-layers';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore } from '../../store/draw';
import {
  collectPoints,
  pointsFromDraw,
  drawLayerOptions,
  numericProperties,
  gridSummary,
  gridWeight,
  showPanelDeckLayer,
  clearPanelDeckLayer,
  type GridAggregation,
  type PointRecord,
} from '../../lib/pointData';

const GROUP = 'panel-spatialstats';

const AGG: Record<GridAggregation, 'COUNT' | 'SUM' | 'MEAN'> = {
  count: 'COUNT',
  sum: 'SUM',
  mean: 'MEAN',
};

/** Cell values can be fractional means, so trim them to something readable. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function SpatialStatsPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const [method, setMethod] = useState<GridAggregation>('count');
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
    // count has no weight to read, so the property only applies to sum/mean
    const weightProperty = method === 'count' ? null : property;
    const agg = AGG[method];
    showPanelDeckLayer(
      GROUP,
      new GridLayer<PointRecord>({
        id: `panel-grid-${Date.now()}`,
        data: points,
        getPosition: (d) => d.position,
        getColorWeight: (d) => gridWeight(d, weightProperty),
        colorAggregation: agg,
        getElevationWeight: (d) => gridWeight(d, weightProperty),
        elevationAggregation: agg,
        cellSize,
        extruded: true,
        pickable: true,
      }),
    );
    const s = gridSummary(points, cellSize, method, weightProperty);
    const label = weightProperty ? `${method}(${weightProperty})` : method;
    setResult(
      `points: ${s.total}\ncells: ${s.cells}\nmethod: ${label}\nmin/cell: ${fmt(s.min)}\nmax/cell: ${fmt(s.max)}`,
    );
  };

  const clear = () => {
    clearPanelDeckLayer(GROUP);
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
            data={propertyOptions}
            value={property}
            onChange={setProperty}
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
    </PanelCard>
  );
}
