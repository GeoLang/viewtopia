import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  ColorSwatch,
  Button,
} from '@mantine/core';
import { IconCategory, IconX } from '@tabler/icons-react';

const CLASS_COLORS: Record<string, string> = {
  ground: '#8B4513',
  vegetation: '#228B22',
  building: '#DC143C',
  water: '#4169E1',
  road: '#808080',
  powerline: '#FFD700',
  unclassified: '#FFFFFF',
};

export function ClassificationPanel({ onClose }: { onClose: () => void }) {
  const [activeClass, setActiveClass] = useState<string | null>('ground');
  const [painting, setPainting] = useState(false);

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
          <IconCategory size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Point Classification
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Class"
          data={Object.keys(CLASS_COLORS).map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          }))}
          value={activeClass}
          onChange={setActiveClass}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Group gap={6}>
          {Object.entries(CLASS_COLORS).map(([name, color]) => (
            <ColorSwatch
              key={name}
              color={color}
              size={18}
              title={name}
              onClick={() => setActiveClass(name)}
              style={{
                cursor: 'pointer',
                border: name === activeClass ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </Group>

        <Button
          size="xs"
          variant={painting ? 'light' : 'filled'}
          color="violet"
          onClick={() => setPainting(!painting)}
          fullWidth
        >
          {painting ? 'Stop Painting' : 'Paint Classification'}
        </Button>

        <Button size="xs" variant="subtle" color="violet" fullWidth>
          Auto-Classify (AI)
        </Button>
      </Stack>
    </Paper>
  );
}
