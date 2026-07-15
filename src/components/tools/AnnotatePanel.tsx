import { useEffect, useRef, useState } from 'react';
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
import {
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  LabelStyle,
} from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';

interface Annotation {
  id: string;
  label: string;
  color: string;
  lat: number;
  lng: number;
  createdAt: number;
}

const STORAGE_KEY = 'viewtopia-annotations';

function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Annotation[]) : [];
  } catch {
    return [];
  }
}

export function AnnotatePanel({ onClose }: { onClose: () => void }) {
  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#a78bfa');
  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState('');
  const placingRef = useRef({ label, color });
  placingRef.current = { label, color };

  // persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  }, [annotations]);

  // keep the live Cesium entities in sync with the annotation list
  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const wanted = new Set(annotations.map((a) => `annot-${a.id}`));
    for (const a of annotations) {
      const eid = `annot-${a.id}`;
      if (viewer.entities.getById(eid)) continue;
      viewer.entities.add({
        id: eid,
        position: Cartesian3.fromDegrees(a.lng, a.lat),
        point: { pixelSize: 8, color: Color.fromCssColorString(a.color), outlineColor: Color.WHITE, outlineWidth: 1 },
        label: {
          text: a.label,
          font: '13px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -14),
        },
      });
    }
    // remove entities whose annotation is gone
    const toRemove = viewer.entities.values.filter(
      (e) => e.id.startsWith('annot-') && !wanted.has(e.id),
    );
    for (const e of toRemove) viewer.entities.remove(e);
  }, [annotations]);

  const addAt = (lng: number, lat: number) => {
    const { label: l, color: c } = placingRef.current;
    if (!l.trim()) {
      setStatus('Enter a label first');
      return;
    }
    setAnnotations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: l.trim(), color: c, lat, lng, createdAt: Date.now() },
    ]);
    setLabel('');
    setStatus(`Placed at ${lat.toFixed(3)}, ${lng.toFixed(3)}`);
  };

  // click-to-place handler on the live Cesium canvas
  useEffect(() => {
    if (!placing) return;
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
      addAt(CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude));
      setPlacing(false);
    }, ScreenSpaceEventType.LEFT_CLICK);
    setStatus('Click the map to place');
    return () => handler.destroy();
  }, [placing]);

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
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
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
            variant={placing ? 'filled' : 'light'}
            color="violet"
            onClick={() => setPlacing((p) => !p)}
            disabled={!label.trim()}
          >
            {placing ? 'Click map…' : 'Place on map'}
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
