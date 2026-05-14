import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Slider,
  Select,
  Switch,
  ColorInput,
} from '@mantine/core';
import { IconFlame, IconX } from '@tabler/icons-react';

export function HeatmapPanel({ onClose }: { onClose: () => void }) {
  const [radius, setRadius] = useState(25);
  const [intensity, setIntensity] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const [colorLow, setColorLow] = useState('#0000ff');
  const [colorHigh, setColorHigh] = useState('#ff0000');
  const [source, setSource] = useState<string | null>('loaded');

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
          <IconFlame size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Heatmap Layer
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Heatmap"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Data Source"
          data={[
            { value: 'loaded', label: 'Loaded features' },
            { value: 'density', label: 'Point density' },
          ]}
          value={source}
          onChange={setSource}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Radius: {radius}px</Text>
        <Slider size="xs" min={5} max={100} value={radius} onChange={setRadius} color="violet" />

        <Text size="xs" c="dimmed">Intensity: {intensity.toFixed(1)}</Text>
        <Slider size="xs" min={0.1} max={5} step={0.1} value={intensity} onChange={setIntensity} color="violet" />

        <Group gap="xs" grow>
          <ColorInput size="xs" label="Low" value={colorLow} onChange={setColorLow} />
          <ColorInput size="xs" label="High" value={colorHigh} onChange={setColorHigh} />
        </Group>
      </Stack>
    </Paper>
  );
}
