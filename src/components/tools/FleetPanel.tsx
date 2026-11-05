import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  ThemeIcon,
} from '@mantine/core';
import { IconX, IconTruck, IconBroadcastOff } from '@tabler/icons-react';

interface FleetPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onTrackVehicle: (vehicleId: string) => void;
  onClose: () => void;
}

export function FleetPanel({ onClose }: FleetPanelProps) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconTruck size={18} />
            <Text fw={600} size="sm">Fleet Tracking</Text>
          </Group>
          <ActionIcon title="Close fleet tracking" aria-label="Close fleet tracking" size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Stack gap="xs" align="center" py="xl">
          <ThemeIcon size="xl" radius="xl" variant="light" color="gray">
            <IconBroadcastOff size={24} />
          </ThemeIcon>
          <Text size="sm" fw={500}>No live feed configured</Text>
          <Text size="xs" c="dimmed" ta="center" maw={260}>
            No vehicle-position service is connected to the platform. Live fleet
            tracking will appear here once a telemetry feed is available.
          </Text>
        </Stack>
      </Stack>
    </Paper>
  );
}
