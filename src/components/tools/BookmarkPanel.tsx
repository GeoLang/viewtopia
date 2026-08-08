import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  ScrollArea,
} from '@mantine/core';
import { IconBookmark, IconCamera, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAppStore } from '../../store/app';
import { useSpaceTimeStore } from '../../features/spacetime/store';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { captureCameraState, flyToCameraState } from '../../store/cameraViews';
import { useAccessibilityStore } from '../../store/accessibility';

export function BookmarkPanel({ onClose }: { onClose: () => void }) {
  const bookmarks = useAppStore((s) => s.bookmarks);
  const addBookmark = useAppStore((s) => s.addBookmark);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const flyTo = useSpaceTimeStore((s) => s.flyTo);
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    const viewer = getActiveCesiumViewer();
    const camera = viewer ? captureCameraState(viewer) : null;
    const cam = getSharedCamera();
    addBookmark({
      id: crypto.randomUUID(),
      name: name.trim(),
      lat: camera?.lat ?? cam.latitude,
      lng: camera?.lng ?? cam.longitude,
      zoom: cam.zoom,
      heading: camera?.heading,
      pitch: camera?.pitch,
      camera: camera ?? undefined,
      createdAt: Date.now(),
    });
    setName('');
    setStatus(camera ? 'Saved current camera' : 'Saved (no viewer, view center)');
  };

  const handleFlyTo = (id: string) => {
    const bm = bookmarks.find((b) => b.id === id);
    if (!bm) return;
    const viewer = getActiveCesiumViewer();
    if (viewer && bm.camera) {
      flyToCameraState(viewer, bm.camera, { reduceMotion });
      setStatus(`Flew to ${bm.name}`);
    } else if (Number.isFinite(bm.lng) && Number.isFinite(bm.lat)) {
      // no cesium viewer (2d renderer) or no camera snapshot: use the
      // renderer-agnostic flyTo pipeline (applied in ViewerArea)
      flyTo(bm.lng, bm.lat, bm.zoom);
      setStatus(`Flew to ${bm.name}`);
    } else {
      setStatus('Bookmark has no coordinates');
    }
  };

  return (
    <PanelCard width={280} maxHeight="50vh">
      <PanelHeader
        icon={<IconBookmark size={16} />}
        title="Bookmarks"
        onClose={onClose}
      />

      <Group gap="xs" mb="xs">
        <TextInput
          size="xs"
          flex={1}
          placeholder="Bookmark name…"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <ActionIcon
          size="sm"
          variant="filled"
          color="violet"
          onClick={handleSave}
          disabled={!name.trim()}
          aria-label="Save bookmark"
        >
          <IconCamera size={14} />
        </ActionIcon>
      </Group>

      {status && (
        <Text size="xs" c="dimmed" mb="xs" data-testid="bookmark-status">
          {status}
        </Text>
      )}

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {bookmarks.length === 0 ? (
            <Text c="dimmed" size="xs" ta="center" py="md">
              No bookmarks saved
            </Text>
          ) : (
            bookmarks.map((bm) => (
              <Group
                key={bm.id}
                justify="space-between"
                p="xs"
                style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => handleFlyTo(bm.id)}
              >
                <Stack gap={0}>
                  <Text size="xs" c="white" fw={500}>
                    {bm.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {bm.lat.toFixed(4)}, {bm.lng.toFixed(4)}
                  </Text>
                </Stack>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBookmark(bm.id);
                  }}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
