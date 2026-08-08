import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useAuthStore } from '../features/auth/store';
import { listNotifications, markNotificationsRead, type LiveNotification } from './api';
import { useLiveStore } from './liveStore';

const NOTIFICATION_POLL_MS = 60_000;

/**
 * Mention notifications for the signed in user. A member with no open live
 * socket has no push channel, so this polls agora and badges the unread count;
 * clicking an entry joins the document and opens its comments.
 */
export function NotificationsBell() {
  const signedIn = useAuthStore((s) => s.token) !== null;
  const connect = useLiveStore((s) => s.connect);
  const setCommentsOpen = useLiveStore((s) => s.setCommentsOpen);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    // a fetch that fails (offline, stack not up) keeps the last list
    listNotifications().then(setNotifications).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setNotifications([]);
      return;
    }
    refresh();
    const timer = setInterval(refresh, NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [signedIn, refresh]);

  if (!signedIn) return null;
  const unread = notifications.filter((entry) => entry.readAt === null).length;

  const openEntry = (entry: LiveNotification) => {
    setNotifications((current) =>
      current.map((candidate) =>
        candidate.id === entry.id && candidate.readAt === null
          ? { ...candidate, readAt: new Date().toISOString() }
          : candidate,
      ),
    );
    markNotificationsRead([entry.id]).catch(() => undefined);
    setOpen(false);
    connect({ documentId: entry.docId });
    setCommentsOpen(true);
  };

  const markAllRead = () => {
    setNotifications((current) =>
      current.map((entry) =>
        entry.readAt === null ? { ...entry, readAt: new Date().toISOString() } : entry,
      ),
    );
    markNotificationsRead().catch(() => undefined);
  };

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom-start"
      width={300}
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <Tooltip label="Mentions">
          <Indicator
            size={14}
            offset={2}
            color="violet"
            label={unread}
            disabled={unread === 0}
            data-testid="notifications-unread"
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color="violet"
              aria-label="Mentions"
              data-testid="notifications-bell"
              onClick={() => {
                setOpen((shown) => !shown);
                refresh();
              }}
            >
              <IconBell size={14} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs" data-testid="notifications-list">
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="white" fw={600}>
              Mentions
            </Text>
            {unread > 0 && (
              <Button size="compact-xs" variant="subtle" color="violet" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </Group>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={4}>
              {notifications.map((entry) => (
                <UnstyledButton
                  key={entry.id}
                  p={6}
                  style={{
                    borderRadius: 4,
                    background:
                      entry.readAt === null ? 'var(--mantine-color-dark-6)' : undefined,
                  }}
                  data-testid="notification-entry"
                  onClick={() => openEntry(entry)}
                >
                  <Text size="xs" c="white">
                    <Text span size="xs" fw={600}>
                      {entry.authorName}
                    </Text>{' '}
                    mentioned you in{' '}
                    <Text span size="xs" fw={600}>
                      {entry.docName}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {entry.excerpt}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(entry.createdAt).toLocaleString()}
                  </Text>
                </UnstyledButton>
              ))}
              {notifications.length === 0 && (
                <Text size="xs" c="dimmed">
                  No mentions yet.
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
