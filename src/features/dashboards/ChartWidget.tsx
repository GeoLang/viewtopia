import { Stack, Group, Select, TextInput, NumberInput, ActionIcon, Button, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useDashboardsStore } from './store';
import type { ChartDatum, ChartType, DashboardWidget } from './types';

// hand-rolled svg charts: the repo has no chart lib, so we draw them directly
// (same precedent as src/plugins/terrain-profile).

const PALETTE = ['#7048e8', '#4c6ef5', '#f76707', '#37b24d', '#f03e3e', '#1098ad'];
const WIDTH = 240;
const HEIGHT = 120;

function BarChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 8;
  const barW = (WIDTH - gap * (data.length + 1)) / data.length;
  return (
    <>
      {data.map((d, i) => {
        const h = (d.value / max) * (HEIGHT - 24);
        const x = gap + i * (barW + gap);
        const y = HEIGHT - h - 16;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill={PALETTE[i % PALETTE.length]} />
            <text x={x + barW / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={9} fill="#9aa0a6">
              {d.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

function LineChart({ data }: { data: ChartDatum[] }) {
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const px = (i: number) => (data.length === 1 ? WIDTH / 2 : 10 + (i / (data.length - 1)) * (WIDTH - 20));
  const py = (v: number) => HEIGHT - 16 - ((v - min) / range) * (HEIGHT - 28);
  const points = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  return (
    <>
      <polyline points={points} fill="none" stroke={PALETTE[0]} strokeWidth={2} />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={px(i)} cy={py(d.value)} r={3} fill={PALETTE[0]} />
          <text x={px(i)} y={HEIGHT - 4} textAnchor="middle" fontSize={9} fill="#9aa0a6">
            {d.label}
          </text>
        </g>
      ))}
    </>
  );
}

function PieChart({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const r = HEIGHT / 2 - 8;
  let angle = -Math.PI / 2;
  return (
    <>
      {data.map((d, i) => {
        const slice = (d.value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        angle += slice;
        const x2 = cx + r * Math.cos(angle);
        const y2 = cy + r * Math.sin(angle);
        const large = slice > Math.PI ? 1 : 0;
        const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
        return <path key={i} d={path} fill={PALETTE[i % PALETTE.length]} />;
      })}
    </>
  );
}

export function ChartView({ chartType, data }: { chartType: ChartType; data: ChartDatum[] }) {
  if (!data || data.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py="md">
        No data
      </Text>
    );
  }
  return (
    <svg
      role="img"
      aria-label={`${chartType} chart`}
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ display: 'block' }}
    >
      {chartType === 'bar' && <BarChart data={data} />}
      {chartType === 'line' && <LineChart data={data} />}
      {chartType === 'pie' && <PieChart data={data} />}
    </svg>
  );
}

export function ChartEditor({ widget }: { widget: DashboardWidget }) {
  const updateWidgetConfig = useDashboardsStore((s) => s.updateWidgetConfig);
  const chartType = (widget.config.chartType as ChartType) ?? 'bar';
  const data = (widget.config.data as ChartDatum[]) ?? [];

  const setData = (next: ChartDatum[]) => updateWidgetConfig(widget.id, { data: next });

  return (
    <Stack gap="xs" mt="xs">
      <Select
        size="xs"
        label="Chart type"
        value={chartType}
        onChange={(v) => updateWidgetConfig(widget.id, { chartType: (v as ChartType) ?? 'bar' })}
        data={[
          { value: 'bar', label: 'Bar' },
          { value: 'line', label: 'Line' },
          { value: 'pie', label: 'Pie' },
        ]}
      />
      {data.map((d, i) => (
        <Group key={i} gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            value={d.label}
            onChange={(e) =>
              setData(data.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))
            }
          />
          <NumberInput
            size="xs"
            w={80}
            value={d.value}
            onChange={(v) =>
              setData(data.map((x, j) => (j === i ? { ...x, value: Number(v) || 0 } : x)))
            }
          />
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            aria-label="Remove point"
            onClick={() => setData(data.filter((_, j) => j !== i))}
          >
            <IconTrash size={12} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="xs"
        variant="light"
        color="violet"
        leftSection={<IconPlus size={12} />}
        onClick={() => setData([...data, { label: `P${data.length + 1}`, value: 0 }])}
      >
        Add point
      </Button>
    </Stack>
  );
}
