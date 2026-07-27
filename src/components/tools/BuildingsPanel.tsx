import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Button,
  Badge,
  Tooltip,
} from '@mantine/core';
import { IconBuildingSkyscraper, IconX } from '@tabler/icons-react';
import { useBuildingStore, fetchOsmBuildings } from '../../store/buildings';
import { useAppStore } from '../../store/app';
import { getSharedCamera } from '../../hooks/sharedCamera';

const BASEMAP_NOTE = 'Buildings are part of this basemap style';

export function BuildingsPanel({ onClose }: { onClose: () => void }) {
  const {
    buildings,
    loading,
    enabled,
    styleHasBuildings,
    setEnabled,
    setLoading,
    setBuildings,
    clearBuildings,
  } = useBuildingStore();
  const renderer = useAppStore((s) => s.renderer);

  const [status, setStatus] = useState<string | null>(null);

  const fromBasemap = renderer === 'maplibre' && styleHasBuildings;

  const handleLoad = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const cam = getSharedCamera();
      const height = 4e7 / 2 ** cam.zoom;
      const result = await fetchOsmBuildings(cam.latitude, cam.longitude, height);
      setBuildings(result);
      setEnabled(true);
      if (result.length === 0) {
        setStatus('No buildings in this view. Zoom closer to a city and try again.');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load buildings.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      clearBuildings();
    } else {
      setEnabled(true);
    }
  };

  const handleClear = () => {
    clearBuildings();
    setStatus(null);
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
          <IconBuildingSkyscraper size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            OSM Buildings
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Load 3D buildings from OpenStreetMap for the current view.
          Zoom in close to a city for best results.
        </Text>

        <Text size="xs" c="dimmed">
          Renderer: <Badge size="xs" variant="light" color="violet">{renderer}</Badge>
        </Text>

        {buildings.length > 0 && (
          <Text size="xs" c="green">
            {buildings.length} buildings loaded
          </Text>
        )}

        {status && (
          <Text size="xs" c="orange">
            {status}
          </Text>
        )}

        {fromBasemap && (
          <Text size="xs" c="orange">
            {BASEMAP_NOTE}
          </Text>
        )}

        <Tooltip label={BASEMAP_NOTE} disabled={!fromBasemap}>
          <div>
            <Stack gap="xs">
              <Switch
                size="xs"
                label="Show Buildings"
                checked={enabled && !fromBasemap}
                disabled={fromBasemap}
                onChange={(e) => handleToggle(e.currentTarget.checked)}
                color="violet"
              />

              <Button
                size="xs"
                variant="filled"
                color="violet"
                loading={loading}
                disabled={fromBasemap}
                onClick={handleLoad}
                fullWidth
              >
                Load Buildings in View
              </Button>
            </Stack>
          </div>
        </Tooltip>

        {buildings.length > 0 && (
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={handleClear}
            fullWidth
          >
            Clear Buildings
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
