import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  FileButton,
  Slider,
  ScrollArea,
} from '@mantine/core';
import { IconCube, IconUpload, IconTrash } from '@tabler/icons-react';
import {
  HeadingPitchRoll,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
} from 'cesium';
import type { Cartesian2, Entity, Viewer } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';

interface Placed {
  id: string;
  name: string;
  url: string;
}

export function ModelImportPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [armed, setArmed] = useState<{ file: File; url: string } | null>(null);
  const [scale, setScale] = useState(1);
  const [heading, setHeading] = useState(0);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const entities = useRef(new Map<string, Entity>());
  const urls = useRef(new Set<string>());
  const resetFileButton = useRef<(() => void) | null>(null);
  // the click handler is armed once and must read the sliders as they are on click
  const transform = useRef({ scale, heading });
  transform.current = { scale, heading };

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  // placed models outlive the panel, their blob urls do not
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!armed || !viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const scene = viewer.scene;
      const position = scene.pickPositionSupported
        ? scene.pickPosition(click.position)
        : viewer.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
      if (!position) return;
      const id = `model-${crypto.randomUUID()}`;
      const hpr = new HeadingPitchRoll(CesiumMath.toRadians(transform.current.heading), 0, 0);
      entities.current.set(
        id,
        viewer.entities.add({
          id,
          name: armed.file.name,
          position,
          orientation: Transforms.headingPitchRollQuaternion(position, hpr),
          model: {
            uri: armed.url,
            scale: transform.current.scale,
            // a metre-scale model is sub-pixel from orbit, so keep it findable
            minimumPixelSize: 64,
          },
        }),
      );
      setPlaced((prev) => [...prev, { id, name: armed.file.name, url: armed.url }]);
      setArmed(null);
      resetFileButton.current?.();
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [armed, viewer]);

  const chooseFile = (file: File | null) => {
    if (!file) return;
    if (armed) {
      URL.revokeObjectURL(armed.url);
      urls.current.delete(armed.url);
    }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setArmed({ file, url });
  };

  const removeModel = (entry: Placed) => {
    const entity = entities.current.get(entry.id);
    if (entity && viewer) viewer.entities.remove(entity);
    entities.current.delete(entry.id);
    URL.revokeObjectURL(entry.url);
    urls.current.delete(entry.url);
    setPlaced((prev) => prev.filter((p) => p.id !== entry.id));
  };

  const shell = (children: ReactNode) => (
    <PanelCard width={280} maxHeight="60vh">
      <PanelHeader
        icon={<IconCube size={16} />}
        title="glTF Model Import"
        onClose={onClose}
      />
      {children}
    </PanelCard>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="model-import-no-cesium">
        Model import needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  return shell(
    <Stack gap="xs" style={{ minHeight: 0 }}>
      <FileButton onChange={chooseFile} accept=".gltf,.glb" resetRef={resetFileButton}>
        {(props) => (
          <Button
            size="xs"
            variant="subtle"
            color="violet"
            leftSection={<IconUpload size={14} />}
            fullWidth
            {...props}
          >
            Select glTF or GLB
          </Button>
        )}
      </FileButton>

      <Text size="xs" c="dimmed">
        Scale: {scale.toFixed(1)}x
      </Text>
      <Slider size="xs" min={0.1} max={10} step={0.1} value={scale} onChange={setScale} color="violet" />

      <Text size="xs" c="dimmed">
        Heading: {heading}°
      </Text>
      <Slider size="xs" min={0} max={359} step={1} value={heading} onChange={setHeading} color="violet" />

      <Text size="xs" c={armed ? 'violet' : 'dimmed'} data-testid="model-import-hint">
        {armed
          ? `Click the map to place ${armed.file.name}`
          : 'Choose a glTF or GLB file, then click the map to place it.'}
      </Text>

      <ScrollArea style={{ minHeight: 0 }}>
        <Stack gap={4}>
          {placed.map((entry) => (
            <Group
              key={entry.id}
              justify="space-between"
              wrap="nowrap"
              p="xs"
              data-testid="model-import-row"
              style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
            >
              <Text size="xs" c="white" truncate>
                {entry.name}
              </Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={`Remove ${entry.name}`}
                onClick={() => removeModel(entry)}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>,
  );
}
