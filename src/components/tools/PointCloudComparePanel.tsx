import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
} from '@mantine/core';
import { IconGitCompare, IconX } from '@tabler/icons-react';

export function PointCloudComparePanel({ onClose }: { onClose: () => void }) {
  const [sourceA, setSourceA] = useState<string | null>(null);
  const [sourceB, setSourceB] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

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
          <IconGitCompare size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Point Cloud Compare
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Compare two point cloud datasets to detect changes.
        </Text>

        <Button size="xs" variant="subtle" color="violet" fullWidth>
          Select Dataset A {sourceA && <Badge size="xs" ml={4}>✓</Badge>}
        </Button>

        <Button size="xs" variant="subtle" color="violet" fullWidth>
          Select Dataset B {sourceB && <Badge size="xs" ml={4}>✓</Badge>}
        </Button>

        <Button
          size="xs"
          variant="filled"
          color="violet"
          onClick={() => setComparing(true)}
          disabled={!sourceA || !sourceB}
          fullWidth
        >
          {comparing ? 'Computing...' : 'Run Comparison'}
        </Button>
      </Stack>
    </Paper>
  );
}
