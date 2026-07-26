import { useEffect, useRef, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Slider,
  SegmentedControl,
} from '@mantine/core';
import { IconScissors, IconX } from '@tabler/icons-react';
import { Cartesian3, ClippingPlane, ClippingPlaneCollection, Ellipsoid } from 'cesium';
import { useAppStore } from '../../store/app';
import { getActiveCesiumViewer } from '../../viewer/registry';

type Axis = 'x' | 'y' | 'z';

/** Globe clipping planes live in the earth-fixed frame, so the axes are ECEF. */
const AXIS_NORMALS: Record<Axis, Cartesian3> = {
  x: new Cartesian3(1, 0, 0),
  y: new Cartesian3(0, 1, 0),
  z: new Cartesian3(0, 0, 1),
};

/** 50% cuts through the earth's centre; the ends push the cut past the surface. */
function planeDistance(position: number): number {
  return ((50 - position) / 50) * Ellipsoid.WGS84.maximumRadius;
}

export function ClippingPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const [axis, setAxis] = useState<Axis>('z');
  const [position, setPosition] = useState(50);
  const [active, setActive] = useState(false);
  const planeRef = useRef<ClippingPlane | null>(null);

  const onCesium = activeTab === 'globe' && renderer === 'cesium';

  // One collection per Cesium viewer: the button only toggles `enabled` and the
  // controls edit the plane in place. Switching to Cesium with the panel open
  // destroys the old viewer, so the collection is rebuilt from the current
  // controls (which is why they are read here but not tracked as deps).
  useEffect(() => {
    const viewer = onCesium ? getActiveCesiumViewer() : null;
    if (!viewer) return;
    const plane = new ClippingPlane(AXIS_NORMALS[axis], planeDistance(position));
    planeRef.current = plane;
    viewer.scene.globe.clippingPlanes = new ClippingPlaneCollection({
      planes: [plane],
      enabled: active,
      edgeWidth: 1,
    });
    return () => {
      planeRef.current = null;
      if (viewer.isDestroyed()) return;
      const planes = viewer.scene.globe.clippingPlanes;
      if (planes) planes.enabled = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCesium]);

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    const plane = planeRef.current;
    if (!viewer || !plane) return;
    plane.normal = AXIS_NORMALS[axis];
    plane.distance = planeDistance(position);
    viewer.scene.globe.clippingPlanes.enabled = active;
    viewer.scene.requestRender();
  }, [axis, position, active]);

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
          <IconScissors size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Clipping Plane
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">Clip Axis</Text>
        <SegmentedControl
          size="xs"
          fullWidth
          value={axis}
          onChange={(v) => setAxis(v as Axis)}
          data={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
        />

        <Text size="xs" c="dimmed">Position: {position}%</Text>
        <Slider
          size="xs"
          min={0}
          max={100}
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
            Cesium only — switch renderer to CesiumJS to clip the globe.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
