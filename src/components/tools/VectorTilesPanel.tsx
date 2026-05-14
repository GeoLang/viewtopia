import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Switch,
  Select,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconVectorTriangle, IconX, IconPlus, IconTrash } from '@tabler/icons-react';

interface VTSource {
  id: string;
  name: string;
  url: string;
}

export function VectorTilesPanel({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<VTSource[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    setSources((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim(), url: url.trim() }]);
    setName('');
    setUrl('');
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
        width: 300,
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
          <IconVectorTriangle size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Vector Tiles
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" mb="xs">
        <TextInput
          size="xs"
          placeholder="Source name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <TextInput
          size="xs"
          placeholder="Tile URL (pbf/mvt)"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          leftSection={<IconPlus size={14} />}
          onClick={handleAdd}
          disabled={!name.trim() || !url.trim()}
        >
          Add Source
        </Button>
      </Stack>

      <ScrollArea flex={1}>
        {sources.length > 0 ? (
          sources.map((s) => (
            <Group key={s.id} justify="space-between" p="xs"
              style={{ background: '#21262d', borderRadius: 4, marginBottom: 4 }}
            >
              <Text size="xs" c="white" lineClamp={1}>{s.name}</Text>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => setSources((p) => p.filter((x) => x.id !== s.id))}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            No vector tile sources added
          </Text>
        )}
      </ScrollArea>
    </Paper>
  );
}
