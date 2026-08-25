import { useEffect, useState } from 'react';
import { Button, Group, Paper, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBroadcast, IconFileImport, IconFolders } from '@tabler/icons-react';
import { useLiveStore } from '../live/liveStore';
import { useProjectsStore } from '../projects/projectsStore';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { useOgcLayerStore } from '../store/ogcLayers';
import { useTourStore } from '../store/tour';
import { useEntryPointStore } from './entryPoints';
import { dismissFirstRun, firstRunDismissed, firstRunVisible, returningVisitor } from './firstRun';

const DEMO_DATASET_URL = '/demo/sf-landmarks.geojson';

const ENTRY_ACTIONS = [
  {
    icon: IconFileImport,
    title: 'Import data',
    detail: 'Drop a GeoJSON, shapefile, FlatGeobuf, CSV or image anywhere on the map.',
    testId: 'first-run-import',
    act: () => useAppStore.getState().setActivePanel('import'),
  },
  {
    icon: IconFolders,
    title: 'Create or open a project',
    detail: 'The project menu in the header keeps a map and its members together.',
    testId: 'first-run-project',
    act: () => useEntryPointStore.getState().request('create-project'),
  },
  {
    icon: IconBroadcast,
    title: 'Start a live session',
    detail: 'The broadcast button in the header shares this map with others as you edit.',
    testId: 'first-run-live',
    act: () => useEntryPointStore.getState().request('live-session'),
  },
] as const;

/** Where to start on an empty map, shown once and never again, with the demo
    dataset and tour as the hands-on alternative. */
export function FirstRunOverlay() {
  const [dismissed, setDismissed] = useState(() => returningVisitor || firstRunDismissed());
  // raster overlays and service layers are imports too, any of them retires this
  const vectorLayerCount = useAgentLayerStore((state) => state.layers.length);
  const rasterLayerCount = useAgentLayerStore((state) => state.rasterLayers.length);
  const ogcLayerCount = useOgcLayerStore((state) => state.layers.length);
  const layerCount = vectorLayerCount + rasterLayerCount + ogcLayerCount;
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const liveDocumentId = useLiveStore((state) => state.documentId);
  const startTour = useTourStore((state) => state.start);

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

  const loadDemoAndTour = async () => {
    dismiss();
    try {
      const response = await fetch(DEMO_DATASET_URL);
      if (!response.ok) throw new Error(`demo dataset: HTTP ${response.status}`);
      const geojson = (await response.json()) as GeoJSON.FeatureCollection;
      useAgentLayerStore.getState().addLayer({
        id: crypto.randomUUID(),
        name: 'San Francisco landmarks',
        color: '#a78bfa',
        geojson,
      });
      startTour();
    } catch (err) {
      notifications.show({
        title: 'Demo failed to load',
        message: err instanceof Error ? err.message : 'could not fetch demo dataset',
        color: 'red',
      });
    }
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
          <UnstyledButton
            key={action.title}
            aria-label={action.title}
            data-testid={action.testId}
            onClick={() => {
              dismiss();
              action.act();
            }}
          >
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size="md" radius="sm" variant="light" color="violet">
                <action.icon size={16} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text size="sm" c="white">{action.title}</Text>
                <Text size="xs" c="dimmed">{action.detail}</Text>
              </Stack>
            </Group>
          </UnstyledButton>
        ))}
        <Group justify="space-between">
          <Button size="xs" variant="light" color="violet" onClick={loadDemoAndTour}>
            Load the demo & take the tour
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={dismiss}>
            Got it
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
