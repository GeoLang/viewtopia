import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  SegmentedControl,
  ColorSwatch,
  Slider,
} from '@mantine/core';
import { IconPencil, IconX } from '@tabler/icons-react';

type DrawMode = 'point' | 'line' | 'polygon' | 'circle' | 'rectangle';

const COLORS = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#f87171'];

export function DrawPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<DrawMode>('polygon');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(2);

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
          <IconPencil size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Draw
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
          onChange={(v) => setMode(v as DrawMode)}
          data={[
            { value: 'point', label: 'Point' },
            { value: 'line', label: 'Line' },
            { value: 'polygon', label: 'Polygon' },
          ]}
        />
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode === 'circle' ? 'circle' : mode === 'rectangle' ? 'rectangle' : ''}
          onChange={(v) => v && setMode(v as DrawMode)}
          data={[
            { value: 'circle', label: 'Circle' },
            { value: 'rectangle', label: 'Rectangle' },
          ]}
        />

        <Text size="xs" c="dimmed">Color</Text>
        <Group gap={6}>
          {COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              size={20}
              onClick={() => setColor(c)}
              style={{
                cursor: 'pointer',
                border: c === color ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </Group>

        <Text size="xs" c="dimmed">Line Width: {lineWidth}px</Text>
        <Slider
          size="xs"
          min={1}
          max={8}
          value={lineWidth}
          onChange={setLineWidth}
          color="violet"
        />

        <Text size="xs" c="dimmed" ta="center" py="xs">
          Click on the map to start drawing. Double-click to finish.
        </Text>

        <Button size="xs" variant="light" color="red" fullWidth>
          Clear All Drawings
        </Button>
      </Stack>
    </Paper>
  );
}
