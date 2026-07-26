import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Select,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconWorld, IconX, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useAppStore } from '../../store/app';
import type { OGCLayer, OGCType } from '../../store/ogcLayers';

interface OGCLayersPanelProps {
  layers: OGCLayer[];
  onAdd: (name: string, url: string, type: OGCType) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function OGCLayersPanel({
  layers,
  onAdd,
  onRemove,
  onClose,
}: OGCLayersPanelProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<OGCType>('wms');
  const renderer = useAppStore((s) => s.renderer);

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    onAdd(name.trim(), url.trim(), type);
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
        width: 340,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconWorld size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            OGC Layers
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" mb="xs" p="xs" style={{ background: '#21262d', borderRadius: 4 }}>
        <TextInput
          size="xs"
          placeholder="Layer name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <TextInput
          size="xs"
          placeholder="Service URL"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Group gap="xs">
          <Select
            size="xs"
            flex={1}
            data={[
              { value: 'wms', label: 'WMS' },
              { value: 'xyz', label: 'XYZ Tiles' },
            ]}
            value={type}
            onChange={(v) => v && setType(v as OGCType)}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <Button
            size="xs"
            color="violet"
            leftSection={<IconPlus size={12} />}
            onClick={handleAdd}
            disabled={!name.trim() || !url.trim()}
          >
            Add
          </Button>
        </Group>
        {renderer === 'deckgl' && (
          <Text size="xs" c="dimmed" data-testid="ogc-note">
            Added services draw on CesiumJS and MapLibre, not the deck.gl renderer.
          </Text>
        )}
      </Stack>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {layers.length === 0 ? (
            <Text c="dimmed" size="xs" ta="center" py="md">
              No OGC layers added
            </Text>
          ) : (
            layers.map((layer) => (
              <Group
                key={layer.id}
                justify="space-between"
                p="xs"
                style={{ background: '#21262d', borderRadius: 4 }}
              >
                <Stack gap={0}>
                  <Text size="xs" c="white">
                    {layer.name}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {layer.url}
                  </Text>
                </Stack>
                <Group gap={4}>
                  <Badge size="xs" variant="light">
                    {layer.type.toUpperCase()}
                  </Badge>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => onRemove(layer.id)}
                  >
                    <IconX size={10} />
                  </ActionIcon>
                </Group>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
