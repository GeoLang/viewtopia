/**
 * The attribute table's tool strips. Each owns its own form state and reports
 * back through one callback, so the table itself stays a table.
 */
import { useState } from 'react';
import { Group, Paper, Select, Stack, Text } from '@mantine/core';
import { ChartView } from '../dashboards/ChartWidget';
import type { ChartType } from '../dashboards/types';
import { buildChartData } from '../../components/tools/ChartsPanel';
import { columnStats } from './attributes';

const inputStyles = { input: { background: '#0d1117', borderColor: '#30363d' } };

const strip = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
};

const show = (v: number | string | null): string => {
  if (v === null) return '—';
  return typeof v === 'number' ? String(Number(v.toPrecision(6))) : v;
};

export function StatsSection({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const [column, setColumn] = useState<string | null>(null);
  const [chartType, setChartType] = useState<string | null>('bar');

  const values = column ? rows.map((r) => r[column]) : [];
  const stats = columnStats(values);
  const chartData = column ? buildChartData(values) : [];

  return (
    <Paper p="xs" mb="xs" style={strip}>
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          w={180}
          label="Column"
          placeholder="pick a column"
          data={columns}
          value={column}
          onChange={setColumn}
          styles={inputStyles}
        />
        <Select
          size="xs"
          w={110}
          label="Chart"
          data={[
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
            { value: 'pie', label: 'Pie' },
          ]}
          value={chartType}
          onChange={setChartType}
          styles={inputStyles}
        />
        {column && (
          <Stack gap={2} flex={1} miw={220}>
            <Text size="xs" c="gray.3" data-testid="attr-stats">
              count {stats.count} · distinct {stats.distinct} · min {show(stats.min)} · max{' '}
              {show(stats.max)} · mean {show(stats.mean)} · median {show(stats.median)}
            </Text>
          </Stack>
        )}
      </Group>

      {chartData.length > 0 && (
        <Paper p="xs" mt="xs" style={{ background: '#21262d', borderRadius: 4, maxWidth: 360 }}>
          <ChartView chartType={(chartType as ChartType) ?? 'bar'} data={chartData} />
        </Paper>
      )}
    </Paper>
  );
}
