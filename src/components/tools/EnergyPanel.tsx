import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
  Select,
} from '@mantine/core';
import { IconBolt, IconX } from '@tabler/icons-react';

export function EnergyPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [metric, setMetric] = useState<string | null>('consumption');
  const [opacity, setOpacity] = useState(70);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBolt size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Energy Heatmap
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Energy Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Metric"
          data={[
            { value: 'consumption', label: 'Energy Consumption' },
            { value: 'efficiency', label: 'Efficiency Rating' },
            { value: 'emissions', label: 'CO₂ Emissions' },
          ]}
          value={metric}
          onChange={setMetric}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider size="xs" min={10} max={100} value={opacity} onChange={setOpacity} color="green" />
      </Stack>
    </Paper>
  );
}
