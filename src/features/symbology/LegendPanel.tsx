import { Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconListDetails } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { layerColor, useAgentLayerStore } from '../../store/agentLayers';
import { legendEntries, symbologyField } from './symbology';

/**
 * Auto-generated legend over every agent layer: one swatch per symbology class,
 * or the layer's single colour when it has none.
 */
export function LegendPanel({ onClose }: { onClose: () => void }) {
  const layers = useAgentLayerStore((s) => s.layers);

  return (
    <PanelCard width={260} maxHeight="60vh" testId="legend-panel">
      <PanelHeader
        icon={<IconListDetails size={16} />}
        title="Legend"
        onClose={onClose}
      />

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
                      <Text size="xs" c="dark.0" lineClamp={1}>
                        {entry.label}
                      </Text>
                    </Group>
                  ))
                ) : (
                  <Group gap={6} wrap="nowrap" data-testid="legend-entry">
                    <div
                      style={{
                        background: layerColor(layer),
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
    </PanelCard>
  );
}
