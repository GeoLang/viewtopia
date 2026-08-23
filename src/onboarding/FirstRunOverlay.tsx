import { useEffect, useState } from 'react';
import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconBroadcast, IconFileImport, IconFolders } from '@tabler/icons-react';
import { useLiveStore } from '../live/liveStore';
import { useProjectsStore } from '../projects/projectsStore';
import { useAgentLayerStore } from '../store/agentLayers';
import { dismissFirstRun, firstRunDismissed, firstRunVisible } from './firstRun';

const ENTRY_ACTIONS = [
  {
    icon: IconFileImport,
    title: 'Import data',
    detail: 'Drop a GeoJSON, shapefile, FlatGeobuf, CSV or image anywhere on the map.',
  },
  {
    icon: IconFolders,
    title: 'Create or open a project',
    detail: 'The project menu in the header keeps a map and its members together.',
  },
  {
    icon: IconBroadcast,
    title: 'Start a live session',
    detail: 'The broadcast button in the header shares this map with others as you edit.',
  },
] as const;

/** Where to start on an empty map, shown once and never again. */
export function FirstRunOverlay() {
  const [dismissed, setDismissed] = useState(firstRunDismissed);
  const layerCount = useAgentLayerStore((state) => state.layers.length);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const liveDocumentId = useLiveStore((state) => state.documentId);

  const visible = firstRunVisible({ dismissed, layerCount, activeProjectId, liveDocumentId });

  useEffect(() => {
    if (dismissed || visible) return;
    dismissFirstRun();
    setDismissed(true);
  }, [dismissed, visible]);

  if (!visible) return null;

  const dismiss = () => {
    dismissFirstRun();
    setDismissed(true);
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="lg"
      data-testid="first-run-overlay"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -60%)',
        zIndex: 300,
        maxWidth: 440,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Stack gap="md">
        <Text fw={600} c="white">Three ways to start</Text>
        {ENTRY_ACTIONS.map((action) => (
          <Group key={action.title} gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon size="md" radius="sm" variant="light" color="violet">
              <action.icon size={16} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text size="sm" c="white">{action.title}</Text>
              <Text size="xs" c="dimmed">{action.detail}</Text>
            </Stack>
          </Group>
        ))}
        <Group justify="flex-end">
          <Button size="xs" variant="subtle" color="gray" onClick={dismiss}>
            Got it
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
