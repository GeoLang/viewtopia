import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
} from '@mantine/core';
import { IconRuler2, IconX } from '@tabler/icons-react';

export function CrossSectionPanel({ onClose }: { onClose: () => void }) {
  const [drawing, setDrawing] = useState(false);
  const [profile, setProfile] = useState<{ distance: number; elevation: number }[]>([]);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconRuler2 size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Cross Section
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Draw a line on the map to generate an elevation cross-section profile.
        </Text>

        <Button
          size="xs"
          variant={drawing ? 'light' : 'filled'}
          color="violet"
          onClick={() => setDrawing(!drawing)}
          fullWidth
        >
          {drawing ? 'Cancel Drawing' : 'Draw Section Line'}
        </Button>

        {profile.length > 0 && (
          <Paper p="xs" style={{ background: '#21262d', borderRadius: 4, height: 120 }}>
            <Text size="xs" c="dimmed" ta="center">
              Profile chart ({profile.length} points)
            </Text>
          </Paper>
        )}

        {profile.length === 0 && !drawing && (
          <Text size="xs" c="dimmed" ta="center" py="md">
            No section drawn yet
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
