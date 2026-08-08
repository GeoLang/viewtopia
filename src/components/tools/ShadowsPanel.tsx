import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Switch,
  Slider,
  Select,
  TextInput,
} from '@mantine/core';
import { IconShadow } from '@tabler/icons-react';
import { JulianDate } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
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
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconShadow size={16} />}
        title="Shadow Analysis"
        onClose={onClose}
      />

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
    </PanelCard>
  );
}
