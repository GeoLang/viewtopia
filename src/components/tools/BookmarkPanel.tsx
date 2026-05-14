import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconBookmark, IconX, IconCamera, IconTrash } from '@tabler/icons-react';

export interface Bookmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  heading?: number;
  pitch?: number;
  createdAt: number;
}

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onFlyTo: (bm: Bookmark) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function BookmarkPanel({
  bookmarks,
  onFlyTo,
  onSave,
  onDelete,
  onClose,
}: BookmarkPanelProps) {
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
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
        maxHeight: '50vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBookmark size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Bookmarks
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Group gap="xs" mb="xs">
        <TextInput
          size="xs"
          flex={1}
          placeholder="Bookmark name…"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <ActionIcon
          size="sm"
          variant="filled"
          color="violet"
          onClick={handleSave}
          disabled={!name.trim()}
        >
          <IconCamera size={14} />
        </ActionIcon>
      </Group>

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
                style={{
                  background: '#21262d',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onClick={() => onFlyTo(bm)}
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
                    onDelete(bm.id);
                  }}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
