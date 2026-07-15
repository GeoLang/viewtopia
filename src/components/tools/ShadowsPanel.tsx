import { useEffect, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
  Select,
  TextInput,
} from '@mantine/core';
import { IconShadow, IconX } from '@tabler/icons-react';
import { JulianDate } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';

/** Build a JulianDate for the given yyyy-mm-dd date at a fractional hour (local). */
function clockTime(date: string, hour: number): JulianDate {
  const [y, m, d] = date.split('-').map(Number);
  const h = Math.floor(hour);
  const min = Math.round((hour % 1) * 60);
  return JulianDate.fromDate(new Date(y, (m || 1) - 1, d || 1, h, min));
}

export function ShadowsPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(12);
  const [date, setDate] = useState('2026-06-21');
  const [softShadows, setSoftShadows] = useState(true);
  const [darkness, setDarkness] = useState(0.3);
  const [size, setSize] = useState<string>('2048');
  const [status, setStatus] = useState('No active viewer');

  const timeLabel = `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

  // Apply the current control state to the live Cesium scene.
  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    viewer.shadows = enabled;
    viewer.scene.globe.enableLighting = enabled;
    viewer.shadowMap.darkness = darkness;
    viewer.shadowMap.softShadows = softShadows;
    viewer.shadowMap.size = Number(size);
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = clockTime(date, hour);
    setStatus(`shadows ${viewer.shadows ? 'on' : 'off'} @ ${timeLabel}`);
  }, [enabled, hour, date, softShadows, darkness, size, timeLabel]);

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
          <IconShadow size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Shadow Analysis
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Shadows"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <TextInput
          size="xs"
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Time of Day: {timeLabel}</Text>
        <Slider size="xs" min={0} max={24} step={0.25} value={hour} onChange={setHour} color="violet" />

        <Text size="xs" c="dimmed">Darkness: {darkness.toFixed(2)}</Text>
        <Slider size="xs" min={0} max={1} step={0.05} value={darkness} onChange={setDarkness} color="violet" />

        <Select
          size="xs"
          label="Shadow Map Size"
          data={['1024', '2048', '4096']}
          value={size}
          onChange={(v) => v && setSize(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Switch
          size="xs"
          label="Soft Shadows"
          checked={softShadows}
          onChange={(e) => setSoftShadows(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="green" data-testid="shadows-status">{status}</Text>
      </Stack>
    </Paper>
  );
}
