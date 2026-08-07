import { useEffect, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  ColorInput,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconMapPin, IconX, IconTrash } from '@tabler/icons-react';
import { Cartesian2, Math as CesiumMath } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { useAnnotationStore } from '../../store/annotations';
import { useAppStore } from '../../store/app';

function placedMessage(lat: number, lng: number): string {
  return `Placed at ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function AnnotatePanel({ onClose }: { onClose: () => void }) {
  const annotations = useAnnotationStore((s) => s.annotations);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const pendingPlacement = useAnnotationStore((s) => s.pendingPlacement);
  const startPlacement = useAnnotationStore((s) => s.startPlacement);
  const cancelPlacement = useAnnotationStore((s) => s.cancelPlacement);
  // both globe renderers bind the click, the 2D map has no annotation binding
  const clickToPlaceWorks = useAppStore((s) => s.activeTab) === 'globe';
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#a78bfa');
  const [status, setStatus] = useState('');

  // closing the panel disarms the map, which would otherwise stay in
  // click-to-place with nothing on screen saying so
  useEffect(() => cancelPlacement, [cancelPlacement]);

  // the renderer hooks own the map click, so the panel learns that its pending
  // placement was consumed from the store rather than from its own handler
  useEffect(
    () =>
      useAnnotationStore.subscribe((state, previous) => {
        const consumed = previous.pendingPlacement !== null && state.pendingPlacement === null;
        if (!consumed || state.annotations.length <= previous.annotations.length) return;
        const placed = state.annotations[state.annotations.length - 1];
        setLabel('');
        setStatus(placedMessage(placed.lat, placed.lng));
      }),
    [],
  );

  const addAt = (lng: number, lat: number) => {
    addAnnotation({
      id: crypto.randomUUID(),
      label: label.trim(),
      color,
      lat,
      lng,
      createdAt: Date.now(),
    });
    cancelPlacement();
    setLabel('');
    setStatus(placedMessage(lat, lng));
  };

  const handlePlaceOnMap = () => {
    if (pendingPlacement) {
      cancelPlacement();
      setStatus('');
      return;
    }
    if (!clickToPlaceWorks) {
      setStatus('Click to place needs the 3D globe');
      return;
    }
    startPlacement(label.trim(), color);
    setStatus('Click the map to place');
  };

  const handlePlaceAtCenter = () => {
    const viewer = getActiveCesiumViewer();
    if (viewer) {
      const canvas = viewer.scene.canvas;
      const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      const cartesian = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
        addAt(CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude));
        return;
      }
    }
    const cam = getSharedCamera();
    addAt(cam.longitude, cam.latitude);
  };

  const handleRemove = (id: string) => {
    removeAnnotation(id);
  };

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
        maxHeight: 'calc(100vh - 120px)',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMapPin size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Annotations
          </Text>
          <Badge size="xs" variant="light" color="violet" data-testid="annotate-count">
            {annotations.length}
          </Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Annotation label…"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <ColorInput
          size="xs"
          value={color}
          onChange={setColor}
          format="hex"
          swatches={['#a78bfa', '#f87171', '#34d399', '#60a5fa', '#fbbf24']}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Group gap="xs" grow>
          <Button
            size="xs"
            variant={pendingPlacement ? 'filled' : 'light'}
            color="violet"
            onClick={handlePlaceOnMap}
            disabled={!label.trim()}
          >
            {pendingPlacement ? 'Click map…' : 'Place on map'}
          </Button>
          <Button size="xs" variant="light" color="violet" onClick={handlePlaceAtCenter} disabled={!label.trim()}>
            Add at center
          </Button>
        </Group>
        {status && (
          <Text size="xs" c="dimmed" data-testid="annotate-status">
            {status}
          </Text>
        )}
      </Stack>

      <ScrollArea flex={1} mt="xs">
        <Stack gap={4}>
          {annotations.map((a) => (
            <Group
              key={a.id}
              p="xs"
              style={{ background: '#21262d', borderRadius: 4 }}
              justify="space-between"
              wrap="nowrap"
            >
              <Group gap={6} wrap="nowrap">
                <div style={{ width: 10, height: 10, borderRadius: 2, background: a.color }} />
                <Stack gap={0}>
                  <Text size="xs" c="white" fw={500}>
                    {a.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {a.lat.toFixed(3)}, {a.lng.toFixed(3)}
                  </Text>
                </Stack>
              </Group>
              <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleRemove(a.id)}>
                <IconTrash size={10} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
