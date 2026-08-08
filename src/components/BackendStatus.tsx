import { ActionIcon, Badge, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import { useAppStore } from '../store/app';

/** One dot for the whole backend: green when every service answers, yellow
 * otherwise. The per-service detail lives in the popover, not the header. */
export function BackendStatus() {
  const { tiletopiaOnline, geolangOnline } = useAppStore();
  const allOnline = tiletopiaOnline && geolangOnline;

  return (
    <Popover width={200} position="bottom-end" shadow="md">
      <Popover.Target>
        <Tooltip label="Service status">
          <ActionIcon aria-label="Service status" variant="subtle" color="gray" size="sm">
            <IconCircleFilled
              size={8}
              color={allOnline ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-yellow-6)'}
            />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" fw={600}>
            Services
          </Text>
          <Badge variant="dot" color={tiletopiaOnline ? 'green' : 'red'} size="xs">
            Tiles
          </Badge>
          <Badge variant="dot" color={geolangOnline ? 'green' : 'yellow'} size="xs">
            AI agent
          </Badge>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
