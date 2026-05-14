import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Select,
  Slider,
  Switch,
} from '@mantine/core';
import { IconPhoto, IconX } from '@tabler/icons-react';

export function RasterViewerPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [band, setBand] = useState<string | null>('rgb');
  const [opacity, setOpacity] = useState(100);
  const [clamp, setClamp] = useState(true);

  const handleLoad = () => {
    if (!url.trim()) return;
    // Load COG / raster from URL
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
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconPhoto size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Raster / COG Viewer
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="xs"
          label="COG / Raster URL"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Select
          size="xs"
          label="Band Display"
          data={[
            { value: 'rgb', label: 'RGB Composite' },
            { value: 'r', label: 'Red' },
            { value: 'g', label: 'Green' },
            { value: 'b', label: 'Blue' },
            { value: 'ndvi', label: 'NDVI' },
          ]}
          value={band}
          onChange={setBand}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider size="xs" min={10} max={100} value={opacity} onChange={setOpacity} color="violet" />

        <Switch
          size="xs"
          label="Clamp to Bounds"
          checked={clamp}
          onChange={(e) => setClamp(e.currentTarget.checked)}
          color="violet"
        />

        <Button size="xs" variant="filled" color="violet" onClick={handleLoad} disabled={!url.trim()} fullWidth>
          Load Raster
        </Button>
      </Stack>
    </Paper>
  );
}
