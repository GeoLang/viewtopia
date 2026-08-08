import { useMemo, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
} from '@mantine/core';
import { IconChartBar, IconX } from '@tabler/icons-react';
import { ChartView } from '../../features/dashboards/ChartWidget';
import type { ChartDatum, ChartType } from '../../features/dashboards/types';
import { useEntityLayers, getEntityLayer, entityAttributes } from '../../lib/entityLayers';

const MAX_FEATURES = 1000;
const HISTOGRAM_BINS = 8;
const MAX_CATEGORIES = 8;

function formatNum(v: number): string {
  return Math.abs(v) >= 1000 ? v.toExponential(1) : Number(v.toPrecision(3)).toString();
}

/** numeric values with many distinct entries → histogram; otherwise category counts */
export function buildChartData(values: unknown[]): ChartDatum[] {
  const present = values.filter((v) => v != null && v !== '');
  if (present.length === 0) return [];
  const nums = present.map(Number);
  const allNumeric = nums.every((n) => Number.isFinite(n));
  const distinct = new Set(present.map(String));

  if (allNumeric && distinct.size > MAX_CATEGORIES) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const width = (max - min) / HISTOGRAM_BINS || 1;
    const bins = Array.from({ length: HISTOGRAM_BINS }, (_, i) => ({
      label: formatNum(min + i * width),
      value: 0,
    }));
    for (const n of nums) {
      const i = Math.min(Math.floor((n - min) / width), HISTOGRAM_BINS - 1);
      bins[i].value++;
    }
    return bins;
  }

  const counts = new Map<string, number>();
  for (const v of present) {
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MAX_CATEGORIES).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(MAX_CATEGORIES).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ label: 'other', value: rest });
  return top;
}

export function ChartsPanel({ onClose }: { onClose: () => void }) {
  const layers = useEntityLayers();
  const [chartType, setChartType] = useState<string | null>('bar');
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [attribute, setAttribute] = useState<string | null>(null);

  const attrRows = useMemo(() => {
    if (dataSource == null) return [];
    const ds = getEntityLayer(Number(dataSource));
    if (!ds) return [];
    return ds.entities.values.slice(0, MAX_FEATURES).map((e) => entityAttributes(e));
  }, [dataSource, layers]);

  const attributeNames = useMemo(() => {
    const names: string[] = [];
    for (const attrs of attrRows) {
      for (const key of Object.keys(attrs)) {
        if (!names.includes(key)) names.push(key);
      }
    }
    return names;
  }, [attrRows]);

  const chartData = useMemo(
    () => (attribute ? buildChartData(attrRows.map((a) => a[attribute])) : []),
    [attrRows, attribute],
  );

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 320,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconChartBar size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Charts
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Layer"
          placeholder={layers.length ? 'Select a loaded layer...' : 'No layers loaded'}
          data={layers.map((l) => ({ value: String(l.index), label: `${l.name} (${l.count})` }))}
          value={dataSource}
          onChange={(v) => {
            setDataSource(v);
            setAttribute(null);
          }}
        />

        <Select
          size="xs"
          label="Attribute"
          placeholder={
            dataSource == null
              ? 'Select a layer first'
              : attributeNames.length
                ? 'Select attribute...'
                : 'Layer has no attributes'
          }
          data={attributeNames}
          value={attribute}
          onChange={setAttribute}
        />

        <Select
          size="xs"
          label="Chart Type"
          data={[
            { value: 'bar', label: '📊 Bar / Histogram' },
            { value: 'line', label: '📈 Line' },
            { value: 'pie', label: '🥧 Pie' },
          ]}
          value={chartType}
          onChange={setChartType}
        />

        <Paper p="sm" style={{ background: '#21262d', borderRadius: 4, minHeight: 150 }}>
          {chartData.length > 0 ? (
            <ChartView chartType={(chartType as ChartType) ?? 'bar'} data={chartData} />
          ) : (
            <Text size="xs" c="dimmed" ta="center" mt="xl">
              {layers.length === 0
                ? 'Load a layer on the globe to chart its attributes'
                : 'Select a layer and attribute to generate a chart'}
            </Text>
          )}
        </Paper>

        {chartData.length > 0 && (
          <Text size="xs" c="dimmed" ta="center" data-testid="charts-count">
            {attrRows.length} features
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
