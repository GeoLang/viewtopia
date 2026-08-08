import { useState } from 'react';
import { Button, Group, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAppStore } from '../store/app';
import { useAgentLayerStore } from '../store/agentLayers';

const WELCOME_SEEN_KEY = 'viewtopia-welcome';
const DEMO_DATASET_URL = '/demo/sf-landmarks.geojson';

// read before the app store's first persist write can create the key
const returningVisitor =
  localStorage.getItem('viewtopia-app') !== null ||
  localStorage.getItem(WELCOME_SEEN_KEY) !== null;

/** First-visit offer: load the demo dataset and hand over to the tour. */
export function WelcomeCard() {
  const [visible, setVisible] = useState(!returningVisitor);
  const setActivePanel = useAppStore((s) => s.setActivePanel);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'seen');
    setVisible(false);
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
      setActivePanel('tour');
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
      p="sm"
      data-testid="welcome-card"
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 350,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <Text size="sm" c="white">
          New here? Load a demo map and take the tour.
        </Text>
        <Button size="xs" color="violet" onClick={loadDemoAndTour}>
          Demo & tour
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={dismiss}>
          Dismiss
        </Button>
      </Group>
    </Paper>
  );
}
