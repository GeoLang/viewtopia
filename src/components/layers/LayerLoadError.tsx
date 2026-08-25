import { ActionIcon, Badge, Group } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useLayerLoadErrorStore } from '../../store/layerLoadErrors';

/**
 * What a layer that cannot load shows on its row: why it is blank, and a retry
 * that asks for its tiles again where the user already is.
 */
export function LayerLoadError({ layerId, layerName }: { layerId: string; layerName: string }) {
  const message = useLayerLoadErrorStore((s) => s.errors[layerId]);
  const retry = useLayerLoadErrorStore((s) => s.retry);

  if (!message) return null;

  return (
    <Group gap={2} wrap="nowrap">
      <Badge size="xs" variant="light" color="red" title={message} data-testid="layer-load-error">
        unavailable
      </Badge>
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        title="Retry"
        aria-label={`Retry ${layerName}`}
        data-testid="layer-retry"
        onClick={(e) => {
          e.stopPropagation();
          retry(layerId);
        }}
      >
        <IconRefresh size={14} />
      </ActionIcon>
    </Group>
  );
}
