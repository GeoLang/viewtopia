import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  FileButton,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconMapRoute, IconUpload, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  BoundingSphere,
  Cartesian3,
  Color,
} from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { parseTrack, type ParsedTrack } from '../../lib/trackParsers';

interface ImportedTrack extends ParsedTrack {
  id: string;
}

export function TrackImportPanel({ onClose }: { onClose: () => void }) {
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [status, setStatus] = useState('');

  const renderTrack = (track: ImportedTrack) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer || track.points.length === 0) return;
    const cartesians = track.points.map(([lng, lat, ele]) =>
      Cartesian3.fromDegrees(lng, lat, ele ?? 0),
    );
    if (cartesians.length >= 2) {
      viewer.entities.add({
        id: `track-line-${track.id}`,
        polyline: { positions: cartesians, width: 3, material: Color.fromCssColorString('#f97316').withAlpha(0.9) },
      });
    }
    track.points.forEach(([lng, lat, ele], i) => {
      viewer.entities.add({
        id: `track-pt-${track.id}-${i}`,
        position: Cartesian3.fromDegrees(lng, lat, ele ?? 0),
        point: { pixelSize: 5, color: Color.fromCssColorString('#fbbf24'), outlineColor: Color.WHITE, outlineWidth: 1 },
      });
    });
    // zoom to extent
    const sphere = BoundingSphere.fromPoints(cartesians);
    viewer.camera.flyToBoundingSphere(sphere, { duration: 1.5 });
  };

  const removeTrack = (id: string) => {
    const viewer = getActiveCesiumViewer();
    if (viewer) {
      const gone = viewer.entities.values.filter((e) => e.id.startsWith(`track-line-${id}`) || e.id.startsWith(`track-pt-${id}`));
      for (const e of gone) viewer.entities.remove(e);
    }
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const text = await file.text();
        const parsed = parseTrack(file.name, text);
        if (parsed.points.length === 0) {
          notifications.show({ title: 'No points', message: file.name, color: 'yellow' });
          continue;
        }
        const track: ImportedTrack = { ...parsed, id: crypto.randomUUID() };
        setTracks((prev) => [...prev, track]);
        renderTrack(track);
        const viewer = getActiveCesiumViewer();
        setStatus(
          `${file.name}: ${parsed.points.length} points${viewer ? ' rendered' : ' (no viewer)'}`,
        );
      } catch (err) {
        notifications.show({
          title: 'Import failed',
          message: `${file.name}: ${err instanceof Error ? err.message : 'parse error'}`,
          color: 'red',
        });
      }
    }
  };

  return (
    <PanelCard width={280} maxHeight="60vh">
      <PanelHeader
        icon={<IconMapRoute size={16} />}
        title="Track Import"
        onClose={onClose}
      />

      <Stack gap="xs">
        <FileButton
          onChange={(f) => f && handleFiles(Array.isArray(f) ? f : [f])}
          accept=".gpx,.kml,.csv"
          multiple
        >
          {(props) => (
            <Button
              size="xs"
              variant="subtle"
              color="violet"
              leftSection={<IconUpload size={14} />}
              fullWidth
              {...props}
            >
              Import GPX / KML / CSV
            </Button>
          )}
        </FileButton>

        {status && (
          <Text size="xs" c="dimmed" data-testid="track-status">
            {status}
          </Text>
        )}
      </Stack>

      <ScrollArea flex={1} mt="xs">
        <Stack gap={4}>
          {tracks.map((t) => (
            <Group
              key={t.id}
              justify="space-between"
              p="xs"
              style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
              wrap="nowrap"
            >
              <Text size="xs" c="white" lineClamp={1}>
                {t.name}
              </Text>
              <Group gap={6} wrap="nowrap">
                <Badge size="xs" variant="light" color="orange">
                  {t.points.length} pts
                </Badge>
                <ActionIcon aria-label="Remove track" size="xs" variant="subtle" color="red" onClick={() => removeTrack(t.id)}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
