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
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  DEFAULT_SHADOW_DARKNESS,
  DEFAULT_SHADOW_MAP_SIZE,
  NOON_HOUR,
  applySunAndShadows,
  formatTimeOfDay,
} from '../../features/scene/shadows';
import { getActiveCesiumViewer } from '../../viewer/registry';

const SHADOW_MAP_SIZES = ['1024', '2048', '4096'];

export function ShadowsPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(NOON_HOUR);
  const [date, setDate] = useState('2026-06-21');
  const [softShadows, setSoftShadows] = useState(true);
  const [darkness, setDarkness] = useState(DEFAULT_SHADOW_DARKNESS);
  const [size, setSize] = useState<string>(String(DEFAULT_SHADOW_MAP_SIZE));
  const [status, setStatus] = useState('No active viewer');

  const timeLabel = formatTimeOfDay(hour);

  // Apply the current control state to the live Cesium scene.
  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    applySunAndShadows(viewer, {
      enabled,
      date,
      hour,
      darkness,
      softShadows,
      shadowMapSize: Number(size),
    });
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
          data={SHADOW_MAP_SIZES}
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
