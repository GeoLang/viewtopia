import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  ScrollArea,
  Switch,
  Slider,
  Button,
} from '@mantine/core';
import { IconStack2, IconX, } from '@tabler/icons-react';

export interface LayerItem {
  id: string;
  name: string;
  type: 'raster' | 'vector' | 'tiles3d' | 'terrain' | 'geojson';
  visible: boolean;
  opacity: number;
}

interface LayerManagerProps {
  layers: LayerItem[];
  onToggle: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onClose: () => void;
}

export function LayerManager({
  layers,
  onToggle,
  onOpacity,
  onRemove,
  onClose,
}: LayerManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          <IconStack2 size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Layers ({layers.length})
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {layers.length === 0 ? (
            <Text c="dimmed" size="xs" ta="center" py="md">
              No layers loaded
            </Text>
          ) : (
            layers.map((layer) => (
              <Paper
                key={layer.id}
                p="xs"
                radius="sm"
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  setExpandedId(expandedId === layer.id ? null : layer.id)
                }
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <Switch
                      size="xs"
                      checked={layer.visible}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggle(layer.id);
                      }}
                    />
                    <Text size="xs" c="white" lineClamp={1}>
                      {layer.name}
                    </Text>
                  </Group>
                  <Badge size="xs" variant="light" color="gray">
                    {layer.type}
                  </Badge>
                </Group>

                {expandedId === layer.id && (
                  <Stack gap="xs" mt="xs">
                    <Group gap="xs">
                      <Text size="xs" c="dimmed" w={50}>
                        Opacity
                      </Text>
                      <Slider
                        size="xs"
                        flex={1}
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(v) => onOpacity(layer.id, v)}
                      />
                      <Text size="xs" c="dimmed" w={30}>
                        {Math.round(layer.opacity * 100)}%
                      </Text>
                    </Group>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(layer.id);
                      }}
                    >
                      Remove
                    </Button>
                  </Stack>
                )}
              </Paper>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
