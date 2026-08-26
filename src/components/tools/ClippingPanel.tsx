import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Button,
  Slider,
  SegmentedControl,
} from '@mantine/core';
import { IconScissors } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  CENTRE_CLIP_POSITION,
  DEFAULT_CLIP_AXIS,
  MAX_CLIP_POSITION,
  MIN_CLIP_POSITION,
  applyGlobeClipping,
  disableGlobeClipping,
  type ClipAxis,
} from '../../features/scene/clipping';
import { useAppStore } from '../../store/app';
import { getActiveCesiumViewer } from '../../viewer/registry';

export function ClippingPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const [axis, setAxis] = useState<ClipAxis>(DEFAULT_CLIP_AXIS);
  const [position, setPosition] = useState(CENTRE_CLIP_POSITION);
  const [active, setActive] = useState(false);

  const onCesium = activeTab === 'globe' && renderer === 'cesium';

  // closing the panel or leaving Cesium takes the cut off the globe again
  useEffect(() => {
    const viewer = onCesium ? getActiveCesiumViewer() : null;
    if (!viewer) return;
    return () => {
      if (!viewer.isDestroyed()) disableGlobeClipping(viewer);
    };
  }, [onCesium]);

  useEffect(() => {
    const viewer = onCesium ? getActiveCesiumViewer() : null;
    if (!viewer) return;
    applyGlobeClipping(viewer, { axis, position, enabled: active });
  }, [onCesium, axis, position, active]);

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconScissors size={16} />}
        title="Clipping Plane"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Text size="xs" c="dimmed">Clip Axis</Text>
        <SegmentedControl
          size="xs"
          fullWidth
          value={axis}
          onChange={(v) => setAxis(v as ClipAxis)}
          data={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
        />

        <Text size="xs" c="dimmed">Position: {position}%</Text>
        <Slider
          size="xs"
          min={MIN_CLIP_POSITION}
          max={MAX_CLIP_POSITION}
          value={position}
          onChange={setPosition}
          color="violet"
        />

        <Button
          size="xs"
          variant={active ? 'light' : 'filled'}
          color="violet"
          onClick={() => setActive(!active)}
          fullWidth
          disabled={!onCesium}
        >
          {active ? 'Disable Clip' : 'Enable Clip'}
        </Button>

        {!onCesium && (
          <Text size="xs" c="dimmed" data-testid="clipping-note">
            Cesium only: switch renderer to CesiumJS to clip the globe.
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
