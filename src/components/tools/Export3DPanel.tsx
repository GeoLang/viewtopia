import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Select,
  Slider,
} from '@mantine/core';
import { IconPrinter, IconX } from '@tabler/icons-react';

export function Export3DPanel({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<string | null>('stl');
  const [resolution, setResolution] = useState(50);

  const handleExport = () => {
    // In a real implementation, this would collect the visible 3D scene geometry
    // and convert it to the selected format for download
    const blob = new Blob(['placeholder'], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viewtopia-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
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
          <IconPrinter size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            3D Print Export
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Output Format"
          data={[
            { value: 'stl', label: 'STL (3D Print)' },
            { value: 'obj', label: 'OBJ' },
            { value: 'gltf', label: 'glTF' },
            { value: 'ply', label: 'PLY' },
          ]}
          value={format}
          onChange={setFormat}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Resolution: {resolution}%</Text>
        <Slider size="xs" min={10} max={100} step={10} value={resolution} onChange={setResolution} color="violet" />

        <Button size="xs" variant="filled" color="violet" onClick={handleExport} fullWidth>
          Export Scene
        </Button>
      </Stack>
    </Paper>
  );
}
