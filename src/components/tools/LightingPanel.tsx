import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Switch,
  Slider,
  Select,
} from '@mantine/core';
import { IconSun } from '@tabler/icons-react';
import { Cartesian3, DirectionalLight, SunLight, JulianDate } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';

/** A downward light direction derived from the time of day (rough sun sweep). */
function directionForHour(hour: number): Cartesian3 {
  const a = (hour / 24) * Math.PI * 2 - Math.PI / 2;
  return Cartesian3.normalize(new Cartesian3(Math.cos(a), Math.sin(a), -0.6), new Cartesian3());
}

export function LightingPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(12);
  const [lightType, setLightType] = useState<string>('sun');
  const [hdr, setHdr] = useState(false);
  const [atmosphere, setAtmosphere] = useState(true);
  const [status, setStatus] = useState('No active viewer');

  const timeLabel = `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    viewer.scene.globe.enableLighting = enabled;
    viewer.scene.highDynamicRange = hdr;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = atmosphere;
    viewer.scene.light =
      lightType === 'directional'
        ? new DirectionalLight({ direction: directionForHour(hour) })
        : new SunLight();
    viewer.clock.shouldAnimate = false;
    const now = new Date();
    viewer.clock.currentTime = JulianDate.fromDate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(hour), Math.round((hour % 1) * 60)),
    );
    setStatus(`lighting ${enabled ? 'on' : 'off'} (${lightType})`);
  }, [enabled, hour, lightType, hdr, atmosphere]);

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconSun size={16} />}
        title="Day Lighting"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Sun Simulation"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Light Source"
          data={[
            { value: 'sun', label: 'Sun Light' },
            { value: 'directional', label: 'Directional' },
          ]}
          value={lightType}
          onChange={(v) => v && setLightType(v)}
        />

        <Text size="xs" c="dimmed">Time of Day: {timeLabel}</Text>
        <Slider size="xs" min={0} max={24} step={0.25} value={hour} onChange={setHour} color="yellow" />

        <Switch
          size="xs"
          label="HDR"
          checked={hdr}
          onChange={(e) => setHdr(e.currentTarget.checked)}
          color="violet"
        />

        <Switch
          size="xs"
          label="Atmosphere"
          checked={atmosphere}
          onChange={(e) => setAtmosphere(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="green" data-testid="lighting-status">{status}</Text>
      </Stack>
    </PanelCard>
  );
}
