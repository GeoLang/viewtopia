import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Button,
  Badge,
} from '@mantine/core';
import { IconChartDots, IconX } from '@tabler/icons-react';

export function SpatialStatsPanel({ onClose }: { onClose: () => void }) {
  const [method, setMethod] = useState<string | null>('density');
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRun = () => {
    setComputing(true);
    setResult(null);
    setTimeout(() => {
      setComputing(false);
      setResult(`${method} analysis complete — 42 clusters found`);
    }, 1500);
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
          <IconChartDots size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Spatial Statistics
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Method"
          data={[
            { value: 'density', label: 'Kernel Density' },
            { value: 'hotspot', label: 'Hotspot (Getis-Ord)' },
            { value: 'cluster', label: 'DBSCAN Clustering' },
            { value: 'moran', label: "Moran's I" },
            { value: 'nearest', label: 'Nearest Neighbor' },
          ]}
          value={method}
          onChange={setMethod}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Button
          size="xs"
          variant="filled"
          color="violet"
          onClick={handleRun}
          loading={computing}
          fullWidth
        >
          Run Analysis
        </Button>

        {result && (
          <Badge size="sm" variant="light" color="green">
            {result}
          </Badge>
        )}
      </Stack>
    </Paper>
  );
}
