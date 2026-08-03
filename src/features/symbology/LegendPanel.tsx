import { ActionIcon, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconListDetails, IconX } from '@tabler/icons-react';
import { useAgentLayerStore } from '../../store/agentLayers';
import { legendEntries, symbologyField } from './symbology';

/**
 * Auto-generated legend over every agent layer: one swatch per symbology class,
 * or the layer's single colour when it has none.
 */
export function LegendPanel({ onClose }: { onClose: () => void }) {
  const layers = useAgentLayerStore((s) => s.layers);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 260,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="legend-panel"
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconListDetails size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Legend
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <ScrollArea flex={1}>
        <Stack gap="sm">
          {layers.length === 0 && (
            <Text c="dimmed" size="xs" ta="center" py="md">
              No layers loaded
            </Text>
          )}
          {layers.map((layer) => {
            const sym = layer.symbology;
            const field = sym && symbologyField(sym);
            return (
              <Stack key={layer.id} gap={4} data-testid="legend-layer">
                <Text size="xs" fw={600} c="white" lineClamp={1}>
                  {layer.name}
                  {field && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      by {field}
                    </Text>
                  )}
                </Text>
                {sym ? (
                  legendEntries(sym).map((entry) => (
                    <Group key={`${entry.color}-${entry.label}`} gap={6} wrap="nowrap" data-testid="legend-entry">
                      <div
                        style={{
                          background: entry.color,
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" c="#c9d1d9" lineClamp={1}>
                        {entry.label}
                      </Text>
                    </Group>
                  ))
                ) : (
                  <Group gap={6} wrap="nowrap" data-testid="legend-entry">
                    <div
                      style={{
                        background: layer.color,
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs" c="dimmed">
                      single colour
                    </Text>
                  </Group>
                )}
              </Stack>
            );
          })}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
