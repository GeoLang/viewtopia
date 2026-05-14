import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconUsers, IconX } from '@tabler/icons-react';

interface CollabUser {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
}

export function CollaborationPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [users] = useState<CollabUser[]>([]);

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
          <IconUsers size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Collaboration
          </Text>
          <Badge size="xs" variant="light" color="violet">
            {users.length} online
          </Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Enable Real-time Sharing"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="violet"
        />

        {enabled && (
          <ScrollArea mah={200}>
            {users.length > 0 ? (
              users.map((user) => (
                <Group key={user.id} gap="xs" py={2}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: user.color,
                    }}
                  />
                  <Text size="xs" c="white">{user.name}</Text>
                </Group>
              ))
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                No other users connected. Share the session URL to collaborate.
              </Text>
            )}
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
