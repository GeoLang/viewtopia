import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Switch,
} from '@mantine/core';
import { IconColumns, IconX } from '@tabler/icons-react';
import { useAppStore } from '../../store/app';

export function SplitViewPanel({ onClose }: { onClose: () => void }) {
  const { splitViewActive, setSplitView } = useAppStore();
  const [leftRenderer, setLeftRenderer] = useState<string | null>('cesium');
  const [rightRenderer, setRightRenderer] = useState<string | null>('maplibre');

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconColumns size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Split View
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Split View"
          checked={splitViewActive}
          onChange={(e) => setSplitView(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Left Panel"
          data={[
            { value: 'cesium', label: 'CesiumJS (3D)' },
            { value: 'maplibre', label: 'MapLibre' },
            { value: 'leaflet', label: 'Leaflet (2D)' },
          ]}
          value={leftRenderer}
          onChange={setLeftRenderer}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Select
          size="xs"
          label="Right Panel"
          data={[
            { value: 'cesium', label: 'CesiumJS (3D)' },
            { value: 'maplibre', label: 'MapLibre' },
            { value: 'leaflet', label: 'Leaflet (2D)' },
          ]}
          value={rightRenderer}
          onChange={setRightRenderer}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
      </Stack>
    </Paper>
  );
}
