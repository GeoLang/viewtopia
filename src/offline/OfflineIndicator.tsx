/**
 * Offline Status Indicator — shows network status and pending sync operations.
 * Sits in the header/toolbar area.
 */

import { useState } from 'react';
import { ActionIcon, Badge, Group, Popover, Stack, Text, Button, Progress } from '@mantine/core';
import { IconCloud, IconCloudOff, IconGitMerge, IconRefresh } from '@tabler/icons-react';
import { useOnlineStatus, useSyncStatus } from './hooks';
import { ConflictResolver } from './ConflictResolver';

function statusColor(online: boolean, pendingCount: number, conflictCount: number): string {
  if (conflictCount > 0) return 'orange';
  if (!online) return 'red';
  return pendingCount > 0 ? 'yellow' : 'green';
}

function statusLabel(online: boolean, pendingCount: number, conflictCount: number): string {
  if (conflictCount > 0) return `${conflictCount} conflict${conflictCount > 1 ? 's' : ''}`;
  if (!online) return 'Offline';
  return pendingCount > 0 ? `${pendingCount} pending` : 'Online';
}

export function OfflineIndicator() {
  const online = useOnlineStatus();
  const {
    status,
    pendingCount,
    lastSyncAt,
    lastError,
    conflicts,
    triggerSync,
    discard,
    resolveConflicts,
    dismissConflicts,
  } = useSyncStatus();
  const [resolverOpen, setResolverOpen] = useState(false);

  const color = statusColor(online, pendingCount, conflicts.length);
  const icon = online ? <IconCloud size={16} /> : <IconCloudOff size={16} />;
  const label = statusLabel(online, pendingCount, conflicts.length);

  return (
    <>
      <Popover width={260} position="bottom" withArrow>
        <Popover.Target>
          <Group gap={4} style={{ cursor: 'pointer' }}>
            <ActionIcon aria-label="Sync status" size="sm" variant="subtle" color={color}>
              {icon}
            </ActionIcon>
            {(!online || pendingCount > 0 || conflicts.length > 0) && (
              <Badge size="xs" color={color} variant="light">
                {label}
              </Badge>
            )}
          </Group>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                {online ? '🟢 Online' : '🔴 Offline'}
              </Text>
              {status === 'syncing' && <Badge size="xs" color="blue">Syncing…</Badge>}
            </Group>

            {conflicts.length > 0 && (
              <>
                <Text size="xs" c="orange">
                  {conflicts.length} feature{conflicts.length > 1 ? 's' : ''} changed here and on the
                  server
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  leftSection={<IconGitMerge size={14} />}
                  onClick={() => setResolverOpen(true)}
                >
                  Resolve Conflicts
                </Button>
              </>
            )}

            {pendingCount > 0 && (
              <>
                <Text size="xs" c="dimmed">
                  {pendingCount} change{pendingCount > 1 ? 's' : ''} waiting to sync
                </Text>
                {status === 'syncing' && <Progress size="xs" animated value={100} />}
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconRefresh size={14} />}
                    onClick={triggerSync}
                    disabled={!online || status === 'syncing'}
                  >
                    Sync Now
                  </Button>
                  <Button size="xs" variant="subtle" color="red" onClick={discard}>
                    Discard
                  </Button>
                </Group>
              </>
            )}

            {pendingCount === 0 && online && (
              <Text size="xs" c="dimmed">All changes synced</Text>
            )}

            {!online && (
              <Text size="xs" c="dimmed">
                Changes are saved locally. They'll sync automatically when you reconnect.
              </Text>
            )}

            {lastError && (
              <Text size="xs" c="red">{lastError}</Text>
            )}

            {lastSyncAt && (
              <Text size="xs" c="dimmed">
                Last sync: {new Date(lastSyncAt).toLocaleTimeString()}
              </Text>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {resolverOpen && conflicts.length > 0 && (
        <ConflictResolver
          conflicts={conflicts}
          onResolved={(results) => {
            setResolverOpen(false);
            void resolveConflicts(results);
          }}
          onCancel={() => {
            setResolverOpen(false);
            dismissConflicts();
          }}
        />
      )}
    </>
  );
}
