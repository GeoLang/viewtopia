import { Anchor, Group, Text } from '@mantine/core';
import { fullViewerUrl } from '../lib/embedMode';
import { useLiveStore } from '../live/liveStore';

/** The one piece of chrome an embed keeps: what this is, and a way out. */
export function EmbedBadge() {
  const documentName = useLiveStore((s) => s.document.meta.name);

  return (
    <Group
      gap={6}
      px={8}
      py={4}
      wrap="nowrap"
      data-testid="embed-badge"
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 300,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        borderRadius: 999,
      }}
    >
      {documentName && (
        <Text size="xs" c="white" truncate maw={220}>
          {documentName}
        </Text>
      )}
      <Anchor href={fullViewerUrl()} target="_blank" rel="noopener" size="xs" c="violet.4">
        Open in ViewTopia
      </Anchor>
    </Group>
  );
}
