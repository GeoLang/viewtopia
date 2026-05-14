import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Select,
  Slider,
} from '@mantine/core';
import { IconCloud, IconX } from '@tabler/icons-react';

export function WeatherPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [effect, setEffect] = useState<string | null>('rain');
  const [intensity, setIntensity] = useState(50);

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
          <IconCloud size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Weather Effects
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Weather"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Effect"
          data={[
            { value: 'rain', label: '🌧 Rain' },
            { value: 'snow', label: '❄ Snow' },
            { value: 'fog', label: '🌫 Fog' },
            { value: 'clouds', label: '☁ Clouds' },
          ]}
          value={effect}
          onChange={setEffect}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Intensity: {intensity}%</Text>
        <Slider size="xs" min={0} max={100} value={intensity} onChange={setIntensity} color="violet" />
      </Stack>
    </Paper>
  );
}
