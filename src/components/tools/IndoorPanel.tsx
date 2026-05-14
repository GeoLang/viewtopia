import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Select,
  Switch,
  Button,
} from '@mantine/core';
import { IconBuilding, IconX } from '@tabler/icons-react';

export function IndoorPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [floor, setFloor] = useState<string | null>('0');

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
          <IconBuilding size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Indoor Navigation
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Indoor Mode"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Floor Level"
          data={[
            { value: '-1', label: 'B1 (Basement)' },
            { value: '0', label: 'Ground Floor' },
            { value: '1', label: 'Floor 1' },
            { value: '2', label: 'Floor 2' },
            { value: '3', label: 'Floor 3' },
          ]}
          value={floor}
          onChange={setFloor}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Button size="xs" variant="subtle" color="violet" fullWidth>
          Load Indoor Map (GeoJSON/IFC)
        </Button>
      </Stack>
    </Paper>
  );
}
