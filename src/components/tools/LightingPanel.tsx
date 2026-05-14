import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
} from '@mantine/core';
import { IconSun, IconX } from '@tabler/icons-react';

export function LightingPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(12);
  const [month, setMonth] = useState(6);
  const [shadowsOn, setShadowsOn] = useState(true);

  const timeLabel = `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

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
          <IconSun size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Day Lighting
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Sun Simulation"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="dimmed">Time of Day: {timeLabel}</Text>
        <Slider size="xs" min={0} max={24} step={0.25} value={hour} onChange={setHour} color="yellow" />

        <Text size="xs" c="dimmed">Month: {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1]}</Text>
        <Slider size="xs" min={1} max={12} value={month} onChange={setMonth} color="yellow" />

        <Switch
          size="xs"
          label="Show Shadows"
          checked={shadowsOn}
          onChange={(e) => setShadowsOn(e.currentTarget.checked)}
          color="violet"
        />
      </Stack>
    </Paper>
  );
}
