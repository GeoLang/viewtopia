import { Button, Skeleton, Stack, Text } from '@mantine/core';

/** placeholder rows while a data panel loads */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap={6} data-testid="panel-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={28} radius="sm" />
      ))}
    </Stack>
  );
}

interface PanelEmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** empty result area with the one action that gets the user unstuck */
export function PanelEmptyState({ message, actionLabel, onAction }: PanelEmptyStateProps) {
  return (
    <Stack gap="xs" align="center" py="md" data-testid="panel-empty">
      <Text size="xs" c="dimmed" ta="center">
        {message}
      </Text>
      {actionLabel && onAction && (
        <Button size="xs" variant="light" color="violet" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
}
