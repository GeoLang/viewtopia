import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  Button,
  SegmentedControl,
} from '@mantine/core';
import { IconRuler, IconX } from '@tabler/icons-react';

type MeasureMode = 'distance' | 'area' | 'elevation';

interface MeasureResult {
  mode: MeasureMode;
  value: number;
  unit: string;
  points: [number, number][];
}

export function MeasurementPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [mode, setMode] = useState<MeasureMode>('distance');
  const [results, setResults] = useState<MeasureResult[]>([]);
  const [measuring, setMeasuring] = useState(false);

  const handleStart = () => {
    setMeasuring(true);
    // TODO: Wire to map click handlers
  };

  const handleClear = () => {
    setResults([]);
    setMeasuring(false);
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
          <IconRuler size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Measurement
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(v) => setMode(v as MeasureMode)}
        data={[
          { value: 'distance', label: 'Distance' },
          { value: 'area', label: 'Area' },
          { value: 'elevation', label: 'Elevation' },
        ]}
        mb="xs"
      />

      <Stack gap="xs">
        {results.map((r, i) => (
          <Group key={i} justify="space-between">
            <Badge size="xs" variant="light" color="violet">
              {r.mode}
            </Badge>
            <Text size="xs" c="white">
              {r.value.toFixed(2)} {r.unit}
            </Text>
          </Group>
        ))}
      </Stack>

      <Group mt="sm" gap="xs">
        <Button
          size="xs"
          variant={measuring ? 'light' : 'filled'}
          color="violet"
          onClick={handleStart}
          flex={1}
        >
          {measuring ? 'Click map…' : 'Start'}
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={handleClear}>
          Clear
        </Button>
      </Group>
    </Paper>
  );
}
