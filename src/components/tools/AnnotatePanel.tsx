import { useEffect, useState } from 'react';
import {
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
import { IconMapPin, IconTrash } from '@tabler/icons-react';
import { Cartesian2 } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { readAnnotationPoint } from '../../viewer/annotationPoint';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { finiteHeight, useAnnotationStore } from '../../store/annotations';
import { randomUuid } from '../../lib/randomUuid';

function placedMessage(lat: number, lng: number, height?: number): string {
  const where = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  const heightMetres = finiteHeight(height);
  return heightMetres === undefined
    ? `Placed at ${where}`
    : `Placed at ${where}, ${heightMetres.toFixed(1)} m`;
}

export function AnnotatePanel({ onClose }: { onClose: () => void }) {
  const annotations = useAnnotationStore((s) => s.annotations);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const pendingPlacement = useAnnotationStore((s) => s.pendingPlacement);
  const startPlacement = useAnnotationStore((s) => s.startPlacement);
  const cancelPlacement = useAnnotationStore((s) => s.cancelPlacement);
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
        setStatus(placedMessage(placed.lat, placed.lng, placed.height));
      }),
    [],
  );

  const addAt = (lng: number, lat: number, height?: number) => {
    const heightMetres = finiteHeight(height);
    addAnnotation({
      id: randomUuid(),
      label: label.trim(),
      color,
      lat,
      lng,
      ...(heightMetres === undefined ? {} : { height: heightMetres }),
      createdAt: Date.now(),
    });
    cancelPlacement();
    setLabel('');
    setStatus(placedMessage(lat, lng, heightMetres));
  };

  const handlePlaceOnMap = () => {
    if (pendingPlacement) {
      cancelPlacement();
      setStatus('');
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
      const point = readAnnotationPoint(viewer, center);
      if (point) {
        addAt(point.lng, point.lat, point.height);
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
    <PanelCard width={280} maxHeight="calc(100vh - 120px)">
      <PanelHeader
        icon={<IconMapPin size={16} />}
        title="Annotations"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet" data-testid="annotate-count">
            {annotations.length}
          </Badge>
        }
      />

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Annotation label…"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
        />
        <ColorInput
          size="xs"
          value={color}
          onChange={setColor}
          format="hex"
          swatches={['#a78bfa', '#f87171', '#34d399', '#60a5fa', '#fbbf24']}
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
          {annotations.map((annotation) => {
            const heightMetres = finiteHeight(annotation.height);
            return (
              <Group
                key={annotation.id}
                p="xs"
                style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                justify="space-between"
                wrap="nowrap"
              >
                <Group gap={6} wrap="nowrap">
                  <div
                    style={{ width: 10, height: 10, borderRadius: 2, background: annotation.color }}
                  />
                  <Stack gap={0}>
                    <Text size="xs" c="white" fw={500}>
                      {annotation.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {annotation.lat.toFixed(3)}, {annotation.lng.toFixed(3)}
                      {heightMetres === undefined ? '' : ` · ${heightMetres.toFixed(1)} m`}
                    </Text>
                  </Stack>
                </Group>
                <ActionIcon
                  title="Delete annotation"
                  aria-label="Delete annotation"
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleRemove(annotation.id)}
                >
                  <IconTrash size={10} />
                </ActionIcon>
              </Group>
            );
          })}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
