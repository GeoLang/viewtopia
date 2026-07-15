import { useEffect, useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Slider,
  Button,
  TextInput,
} from '@mantine/core';
import { IconWorld, IconX } from '@tabler/icons-react';
import {
  createWorldTerrainAsync,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
} from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';

export function GlobalTerrainPanel({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<string | null>('cesium');
  const [url, setUrl] = useState('');
  const [exaggeration, setExaggeration] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ellipsoid (default)');

  // Vertical exaggeration is a scene setting: apply live, no provider needed.
  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (viewer) viewer.scene.verticalExaggeration = exaggeration;
  }, [exaggeration]);

  const enableTerrain = async () => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    setLoading(true);
    try {
      const tp =
        provider === 'custom'
          ? await CesiumTerrainProvider.fromUrl(url)
          : await createWorldTerrainAsync();
      viewer.terrainProvider = tp;
      setStatus(provider === 'custom' ? 'Custom terrain enabled' : 'Cesium World Terrain enabled');
    } catch (e) {
      // World terrain needs an Ion token; a missing/invalid one rejects here.
      setStatus(`Terrain failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const resetTerrain = () => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      return;
    }
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    setStatus('Ellipsoid (default)');
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
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconWorld size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Global Terrain
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Provider"
          data={[
            { value: 'cesium', label: 'Cesium World Terrain' },
            { value: 'custom', label: 'Custom URL' },
          ]}
          value={provider}
          onChange={setProvider}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {provider === 'custom' && (
          <TextInput
            size="xs"
            label="Terrain URL"
            placeholder="https://…/terrain"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
        )}

        <Button size="xs" color="violet" onClick={enableTerrain} loading={loading} fullWidth>
          Enable Terrain
        </Button>

        <Text size="xs" c="dimmed">Exaggeration: {exaggeration.toFixed(1)}×</Text>
        <Slider size="xs" min={0.5} max={10} step={0.5} value={exaggeration} onChange={setExaggeration} color="violet" />

        <Button size="xs" variant="subtle" color="gray" onClick={resetTerrain} fullWidth>
          Reset to Ellipsoid
        </Button>

        <Text size="xs" c="green" data-testid="terrain-status">{status}</Text>
      </Stack>
    </Paper>
  );
}
