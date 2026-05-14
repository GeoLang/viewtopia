import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Switch,
  Slider,
} from '@mantine/core';
import { IconMountain, IconX } from '@tabler/icons-react';

export function TerrainAnalysisPanel({ onClose }: { onClose: () => void }) {
  const [analysis, setAnalysis] = useState<string | null>('slope');
  const [enabled, setEnabled] = useState(false);
  const [opacity, setOpacity] = useState(70);

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
          <IconMountain size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Terrain Analysis
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Analysis Type"
          data={[
            { value: 'slope', label: 'Slope' },
            { value: 'aspect', label: 'Aspect' },
            { value: 'hillshade', label: 'Hillshade' },
            { value: 'contour', label: 'Contour Lines' },
            { value: 'curvature', label: 'Curvature' },
          ]}
          value={analysis}
          onChange={setAnalysis}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Switch
          size="xs"
          label="Enable Layer"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Text size="xs" c="dimmed">Opacity: {opacity}%</Text>
        <Slider size="xs" min={10} max={100} value={opacity} onChange={setOpacity} color="violet" />
      </Stack>
    </Paper>
  );
}
