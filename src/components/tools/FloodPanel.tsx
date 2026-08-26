import { useEffect, useState } from 'react';
import { Text, Stack, Group, Slider, Button } from '@mantine/core';
import { IconDroplet } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAuthStore } from '../../features/auth/store';
import { clearFlood, runFlood, useTerrainAnalysisStore } from '../../features/terrain/analysis';
import { currentBbox, SIGN_IN_HINT } from '../../lib/terrainAnalysis';

const DEFAULT_WATER_LEVEL_METERS = 20;

export function FloodPanel({ onClose }: { onClose: () => void }) {
  const [waterLevel, setWaterLevel] = useState(DEFAULT_WATER_LEVEL_METERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cells = useTerrainAnalysisStore((s) => (s.flood ? s.flood.floodedCells : null));
  const needsSignIn = useAuthStore((s) => !s.token);

  useEffect(() => clearFlood, []);

  const run = async () => {
    const bbox = currentBbox();
    if (!bbox) {
      setError('Cannot read the current map view');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await runFlood(waterLevel, bbox);
    } catch {
      setError('Flood request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconDroplet size={16} />}
        title="Flood Simulation"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Floods cells below the water level across the current map view.
        </Text>

        <Text size="xs" c="dimmed">Water Level: {waterLevel}m</Text>
        <Slider size="xs" min={0} max={100} step={1} value={waterLevel} onChange={setWaterLevel} color="blue" />

        <Group grow>
          <Button
            size="xs"
            color="blue"
            onClick={run}
            loading={loading}
            disabled={needsSignIn}
          >
            Simulate
          </Button>
          <Button size="xs" variant="default" onClick={clearFlood}>
            Clear
          </Button>
        </Group>

        {needsSignIn && (
          <Text size="xs" c="dimmed" data-testid="flood-signin">
            {SIGN_IN_HINT}
          </Text>
        )}

        {cells !== null && (
          <Text size="xs" c="dimmed">
            {cells} flooded cell{cells === 1 ? '' : 's'}
          </Text>
        )}

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
