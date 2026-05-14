import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  Progress,
} from '@mantine/core';
import { IconDeviceFloppy, IconX, IconDownload, IconTrash } from '@tabler/icons-react';

interface CachedRegion {
  id: string;
  name: string;
  tiles: number;
  sizeMb: number;
}

export function OfflinePanel({ onClose }: { onClose: () => void }) {
  const [caching, setCaching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [regions] = useState<CachedRegion[]>([]);

  const handleCache = () => {
    setCaching(true);
    setProgress(0);
    const iv = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(iv);
          setCaching(false);
          return 100;
        }
        return p + 10;
      });
    }, 300);
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
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconDeviceFloppy size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Offline Cache
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Cache the current view area for offline use.
        </Text>

        {caching && <Progress value={progress} color="violet" size="sm" animated />}

        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={<IconDownload size={14} />}
          onClick={handleCache}
          disabled={caching}
          fullWidth
        >
          {caching ? `Caching... ${progress}%` : 'Cache Current View'}
        </Button>

        {regions.length > 0 ? (
          regions.map((r) => (
            <Group key={r.id} justify="space-between">
              <Text size="xs" c="white">{r.name}</Text>
              <Group gap={4}>
                <Badge size="xs" variant="light">{r.tiles} tiles</Badge>
                <Badge size="xs" variant="light">{r.sizeMb}MB</Badge>
                <ActionIcon size="xs" variant="subtle" color="red">
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            </Group>
          ))
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            No cached regions
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
