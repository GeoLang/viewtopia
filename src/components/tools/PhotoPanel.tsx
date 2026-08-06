import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Anchor,
  Badge,
  Loader,
  ScrollArea,
  Switch,
  Slider,
  UnstyledButton,
} from '@mantine/core';
import { IconCamera, IconX } from '@tabler/icons-react';
import {
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import type { Cartesian2, Entity, Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { SOURCE_COLOR, searchPhotos, type PhotoResult } from '../../lib/photoSearch';

const ENTITY_PREFIX = 'photo-marker-';

export function PhotoPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(500);
  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const [selected, setSelected] = useState<PhotoResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

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

  useEffect(() => {
    if (!enabled) {
      setPhotos([]);
      setSelected(null);
      setErrors([]);
      setSearched(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position) as { id?: Entity } | undefined;
      const pickedId = typeof picked?.id?.id === 'string' ? picked.id.id : '';
      if (pickedId.startsWith(ENTITY_PREFIX)) {
        const hit = photos.find((p) => `${ENTITY_PREFIX}${p.id}` === pickedId);
        if (hit) {
          setSelected(hit);
          return;
        }
      }
      const scene = viewer.scene;
      const position = scene.pickPositionSupported
        ? scene.pickPosition(click.position)
        : viewer.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
      if (!position) return;
      const carto = Cartographic.fromCartesian(position);
      const lon = CesiumMath.toDegrees(carto.longitude);
      const lat = CesiumMath.toDegrees(carto.latitude);
      setBusy(true);
      setSelected(null);
      void searchPhotos(lon, lat, radius)
        .then((result) => {
          setPhotos(result.photos);
          setErrors(result.errors);
          setSearched(true);
        })
        .finally(() => setBusy(false));
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [enabled, viewer, radius, photos]);

  useEffect(() => {
    if (!viewer || photos.length === 0) return;
    const added: Entity[] = photos.map((p) =>
      viewer.entities.add({
        id: `${ENTITY_PREFIX}${p.id}`,
        position: Cartesian3.fromDegrees(p.lon, p.lat),
        point: {
          pixelSize: 9,
          color: Color.fromCssColorString(SOURCE_COLOR[p.source]),
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
    return () => {
      if (viewer.isDestroyed()) return;
      for (const entity of added) viewer.entities.remove(entity);
    };
  }, [viewer, photos]);

  const shell = (children: ReactNode) => (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconCamera size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Street-Level Photos
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="photo-no-cesium">
        Photo search needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  const counts = {
    panoramax: photos.filter((p) => p.source === 'panoramax').length,
    commons: photos.filter((p) => p.source === 'commons').length,
  };

  return shell(
    <Stack gap="xs">
      <Switch
        size="xs"
        label="Show Photo Markers"
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
        color="violet"
      />

      <Text size="xs" c="dimmed">
        Search Radius: {radius}m
      </Text>
      <Slider
        size="xs"
        min={100}
        max={5000}
        step={100}
        value={radius}
        onChange={setRadius}
        color="violet"
        disabled={!enabled}
      />

      <Group gap="xs" justify="center">
        {busy && <Loader size="xs" color="violet" />}
        <Text size="xs" c="dimmed" ta="center" data-testid="photo-status">
          {!enabled
            ? 'Turn on photo markers, then click the map to find nearby imagery.'
            : busy
              ? 'Searching Panoramax and Wikimedia Commons…'
              : !searched
                ? 'Click the map to find nearby street-level imagery.'
                : photos.length === 0
                  ? 'No photos within the search radius. Try a wider radius.'
                  : `${counts.panoramax} Panoramax · ${counts.commons} Commons`}
        </Text>
      </Group>

      {errors.map((error) => (
        <Text key={error} size="xs" c="yellow" data-testid="photo-error">
          {error}
        </Text>
      ))}

      {selected && (
        <Stack gap={4}>
          <Anchor href={selected.fullUrl} target="_blank" rel="noreferrer">
            <img
              src={selected.thumbUrl}
              alt={selected.title}
              style={{ width: '100%', borderRadius: 6, display: 'block' }}
            />
          </Anchor>
          <Text size="xs" c="white">
            {selected.title}
          </Text>
          <Text size="xs" c="dimmed">
            {selected.credit}
            {' · '}
            <Anchor size="xs" href={selected.licenseUrl} target="_blank" rel="noreferrer">
              {selected.license}
            </Anchor>
          </Text>
        </Stack>
      )}

      {photos.length > 0 && (
        <ScrollArea.Autosize mah={200}>
          <Stack gap={2}>
            {photos.map((photo) => (
              <UnstyledButton
                key={photo.id}
                onClick={() => setSelected(photo)}
                style={{
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: selected?.id === photo.id ? '#21262d' : 'transparent',
                }}
              >
                <Group gap="xs" wrap="nowrap">
                  <Badge
                    size="xs"
                    variant="filled"
                    styles={{ root: { background: SOURCE_COLOR[photo.source] } }}
                  >
                    {photo.source === 'panoramax' ? 'PNX' : 'WC'}
                  </Badge>
                  <Text size="xs" c="#c9d1d9" truncate>
                    {photo.title}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>,
  );
}
