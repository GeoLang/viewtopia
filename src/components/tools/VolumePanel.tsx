import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  SegmentedControl,
} from '@mantine/core';
import { IconCube, IconX } from '@tabler/icons-react';

type VolumeMode = 'cut' | 'fill' | 'both';

export function VolumePanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<VolumeMode>('both');
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<{ cut: number; fill: number } | null>(null);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 270,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconCube size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Volume Measurement
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode}
          onChange={(v) => setMode(v as VolumeMode)}
          data={[
            { value: 'cut', label: 'Cut' },
            { value: 'fill', label: 'Fill' },
            { value: 'both', label: 'Both' },
          ]}
        />

        <Text size="xs" c="dimmed">
          Draw a polygon on the terrain to calculate cut/fill volume.
        </Text>

        <Button
          size="xs"
          variant={drawing ? 'light' : 'filled'}
          color="violet"
          onClick={() => setDrawing(!drawing)}
          fullWidth
        >
          {drawing ? 'Finish Polygon' : 'Draw Region'}
        </Button>

        {result && (
          <Stack gap={4}>
            {(mode === 'cut' || mode === 'both') && (
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Cut Volume</Text>
                <Badge size="xs" color="red">{result.cut.toFixed(0)} m³</Badge>
              </Group>
            )}
            {(mode === 'fill' || mode === 'both') && (
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Fill Volume</Text>
                <Badge size="xs" color="green">{result.fill.toFixed(0)} m³</Badge>
              </Group>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
