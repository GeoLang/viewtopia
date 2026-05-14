import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Button,
} from '@mantine/core';
import { IconChartBar, IconX } from '@tabler/icons-react';

export function ChartsPanel({ onClose }: { onClose: () => void }) {
  const [chartType, setChartType] = useState<string | null>('bar');
  const [dataSource, setDataSource] = useState<string | null>(null);

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
          label="Chart Type"
          data={[
            { value: 'bar', label: '📊 Bar Chart' },
            { value: 'line', label: '📈 Line Chart' },
            { value: 'pie', label: '🥧 Pie Chart' },
            { value: 'scatter', label: '⚬ Scatter Plot' },
            { value: 'histogram', label: '📶 Histogram' },
          ]}
          value={chartType}
          onChange={setChartType}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Select
          size="xs"
          label="Data Source"
          placeholder="Select a loaded layer..."
          data={[]}
          value={dataSource}
          onChange={setDataSource}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Paper p="sm" style={{ background: '#21262d', borderRadius: 4, height: 150 }}>
          <Text size="xs" c="dimmed" ta="center" mt="xl">
            Load data and select attributes to generate a chart
          </Text>
        </Paper>

        <Button size="xs" variant="filled" color="violet" fullWidth disabled={!dataSource}>
          Generate Chart
        </Button>
      </Stack>
    </Paper>
  );
}
