import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MantineProvider,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlayerTrackNext, IconPlayerTrackPrev } from '@tabler/icons-react';
import { theme } from '../theme';
import {
  loadStorySteps,
  openStoryPresenterChannel,
  type StoryPresenterChannel,
} from '../lib/storyPresenter';
import type { StoryStep } from '../lib/storyExport';

/** How long the viewer window has to answer before the presenter calls it gone. */
const VIEWER_REPLY_TIMEOUT_MS = 1500;

type ViewerLink = 'waiting' | 'connected' | 'disconnected';

const LINK_BADGE: Record<ViewerLink, { color: string; label: string }> = {
  waiting: { color: 'gray', label: 'Connecting…' },
  connected: { color: 'teal', label: 'Viewer connected' },
  disconnected: { color: 'red', label: 'Viewer disconnected' },
};

function StepNotes({ notes }: { notes?: string }) {
  if (!notes) return <Text size="sm" c="dimmed" fs="italic">No speaker notes.</Text>;
  return (
    <Text size="sm" c="gray.3" style={{ whiteSpace: 'pre-wrap' }}>
      {notes}
    </Text>
  );
}

function PresenterBody() {
  const [steps, setSteps] = useState<StoryStep[]>(loadStorySteps);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [link, setLink] = useState<ViewerLink>('waiting');
  const channelRef = useRef<StoryPresenterChannel | null>(null);
  const replyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const channel = openStoryPresenterChannel((message) => {
      switch (message.type) {
        case 'state':
          if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current);
          replyTimerRef.current = null;
          setLink('connected');
          setIndex(message.index);
          setPlaying(message.playing);
          return;
        case 'steps-changed': {
          const reloaded = loadStorySteps();
          setSteps(reloaded);
          setIndex((position) => Math.min(position, Math.max(0, reloaded.length - 1)));
          return;
        }
        case 'viewer-closed':
          setLink('disconnected');
          return;
      }
    });
    channelRef.current = channel;
    channel.send({ type: 'hello' });
    replyTimerRef.current = window.setTimeout(
      () => setLink('disconnected'),
      VIEWER_REPLY_TIMEOUT_MS,
    );

    return () => {
      if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= steps.length) return;
      setIndex(target);
      channelRef.current?.send({ type: 'goto', index: target });
      if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = window.setTimeout(
        () => setLink('disconnected'),
        VIEWER_REPLY_TIMEOUT_MS,
      );
    },
    [steps.length],
  );

  const current = steps[index];
  const next = steps[index + 1];
  const badge = LINK_BADGE[link];

  return (
    <Box p="md" h="100vh" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Group justify="space-between">
        <Text size="sm" c="dimmed" data-testid="presenter-position">
          {steps.length === 0 ? 'No steps' : `Step ${index + 1} of ${steps.length}`}
        </Text>
        <Group gap="xs">
          {playing && (
            <Badge size="sm" variant="light" color="violet">
              Playing
            </Badge>
          )}
          <Badge size="sm" variant="light" color={badge.color} data-testid="presenter-link">
            {badge.label}
          </Badge>
        </Group>
      </Group>

      {current ? (
        <Stack gap={6}>
          <Text size="xl" fw={700} c="white" data-testid="presenter-title">
            {current.title}
          </Text>
          {current.description && (
            <Text size="sm" c="gray.5" style={{ whiteSpace: 'pre-wrap' }}>
              {current.description}
            </Text>
          )}
          <Box data-testid="presenter-notes">
            <StepNotes notes={current.notes} />
          </Box>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          This story has no steps yet. Add them in the viewer's Stories panel.
        </Text>
      )}

      <Paper p="sm" radius="md" bg="dark.6" data-testid="presenter-next-step">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>
          Next
        </Text>
        {next ? (
          <Stack gap={4}>
            <Text size="sm" fw={600} c="white">
              {next.title}
            </Text>
            <StepNotes notes={next.notes} />
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            End of story.
          </Text>
        )}
      </Paper>

      <Group gap="xs">
        <Button
          variant="light"
          color="violet"
          leftSection={<IconPlayerTrackPrev size={16} />}
          onClick={() => goTo(index - 1)}
          disabled={index <= 0}
          data-testid="presenter-prev"
          flex={1}
        >
          Previous
        </Button>
        <Button
          variant="light"
          color="violet"
          leftSection={<IconPlayerTrackNext size={16} />}
          onClick={() => goTo(index + 1)}
          disabled={index >= steps.length - 1}
          data-testid="presenter-next"
          flex={1}
        >
          Next
        </Button>
      </Group>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {steps.map((step, position) => (
            <Button
              key={step.id}
              size="xs"
              justify="start"
              variant={position === index ? 'filled' : 'subtle'}
              color={position === index ? 'violet' : 'gray'}
              onClick={() => goTo(position)}
            >
              {position + 1}. {step.title}
            </Button>
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  );
}

/** The speaker-notes window: no map, so it never loads the viewer engines. */
export function StoryPresenterView() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Box bg="dark.8" mih="100vh">
        <PresenterBody />
      </Box>
    </MantineProvider>
  );
}
