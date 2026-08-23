import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconDownload, IconMapPin, IconMessage } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../components/PanelCard';
import { downloadFile } from '../features/spacetime/analysis/export';
import { commentExportFilename, commentsAsCsv, commentsAsGeoJson } from './commentExport';
import { Thread, useMentionCandidates } from './CommentThread';
import { commentThreads, currentMapAnchor, flyToComment, postComment } from './comments';
import { useLiveStore } from './liveStore';
import { MentionTextarea } from './MentionTextarea';
import type { LiveCommentMention } from './types';

/** how long a deep linked thread keeps its highlight ring */
const FOCUS_HIGHLIGHT_MS = 4000;

export function LiveCommentsPanel({ onClose }: { onClose: () => void }) {
  const comments = useLiveStore((s) => s.document.comments);
  const ownActor = useLiveStore((s) => s.actor);
  const role = useLiveStore((s) => s.role);
  const documentId = useLiveStore((s) => s.documentId) ?? '';
  const documentName = useLiveStore((s) => s.document.meta.name);
  const focusedCommentId = useLiveStore((s) => s.focusedCommentId);
  const clearFocusedComment = useLiveStore((s) => s.clearFocusedComment);
  const [text, setText] = useState('');
  const [withAnchor, setWithAnchor] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [mentions, setMentions] = useState<LiveCommentMention[]>([]);
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(null);

  // no actor means the session has not told us who we are, so nothing to attribute to
  const canWrite = role === 'edit' && ownActor !== null;
  const candidates = useMentionCandidates(canWrite);
  const threads = commentThreads(comments);
  const visible = showResolved ? threads : threads.filter((thread) => !thread.root.resolved);
  const resolvedCount = threads.filter((thread) => thread.root.resolved).length;

  // a deep linked comment is acted on once it exists in the document: show its
  // thread (even resolved), ring it, and fly to where it points
  useEffect(() => {
    if (!focusedCommentId) return;
    const target = comments[focusedCommentId];
    if (!target) return;
    const rootId = target.parentId ?? target.id;
    if (comments[rootId]?.resolved) setShowResolved(true);
    setHighlightedThreadId(rootId);
    const anchored = target.anchor ? target : comments[rootId];
    if (anchored?.anchor) flyToComment(anchored);
    clearFocusedComment();
  }, [focusedCommentId, comments, clearFocusedComment]);

  useEffect(() => {
    if (highlightedThreadId === null) return;
    const timer = setTimeout(() => setHighlightedThreadId(null), FOCUS_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedThreadId]);

  const send = () => {
    if (!postComment({ text, anchor: withAnchor ? currentMapAnchor() : null, mentions })) return;
    setText('');
    setWithAnchor(false);
    setMentions([]);
  };

  return (
    <PanelCard width={320} maxHeight="calc(100vh - 120px)" testId="live-comments-panel">
      <PanelHeader
        icon={<IconMessage size={16} />}
        title="Comments"
        onClose={onClose}
        closeLabel="Close comments"
        badge={
          <Group gap={4} wrap="nowrap">
            <Badge size="xs" variant="light" color="violet" data-testid="comment-count">
              {visible.length}
            </Badge>
            {threads.length > 0 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label="Export comments">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="violet"
                      aria-label="Export comments"
                      data-testid="comment-export"
                    >
                      <IconDownload size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    data-testid="comment-export-csv"
                    onClick={() =>
                      downloadFile(
                        commentsAsCsv(comments),
                        commentExportFilename(documentName, 'csv'),
                        'text/csv',
                      )
                    }
                  >
                    CSV
                  </Menu.Item>
                  <Menu.Item
                    data-testid="comment-export-geojson"
                    onClick={() =>
                      downloadFile(
                        commentsAsGeoJson(comments),
                        commentExportFilename(documentName, 'geojson'),
                        'application/geo+json',
                      )
                    }
                  >
                    GeoJSON
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        }
      />

      {canWrite ? (
        <Stack gap="xs">
          <MentionTextarea
            value={text}
            onChange={setText}
            onPick={(mention) => setMentions((picked) => [...picked, mention])}
            candidates={candidates}
            placeholder="Leave a comment…"
            ariaLabel="Leave a comment"
            minRows={2}
            maxRows={6}
            testId="comment-compose"
          />
          <Group gap="xs" wrap="nowrap">
            <Button
              size="xs"
              variant={withAnchor ? 'filled' : 'light'}
              color="violet"
              leftSection={<IconMapPin size={12} />}
              data-testid="comment-anchor-toggle"
              onClick={() => setWithAnchor((attached) => !attached)}
            >
              {withAnchor ? 'View attached' : 'Attach view'}
            </Button>
            <Button
              size="xs"
              color="violet"
              flex={1}
              disabled={!text.trim()}
              data-testid="comment-submit"
              onClick={send}
            >
              Comment
            </Button>
          </Group>
        </Stack>
      ) : (
        <Text size="xs" c="dimmed" data-testid="comments-read-only">
          You are viewing this map read only.
        </Text>
      )}

      {resolvedCount > 0 && (
        <Switch
          mt="xs"
          size="xs"
          color="violet"
          label={`Show ${resolvedCount} resolved`}
          checked={showResolved}
          onChange={(event) => setShowResolved(event.currentTarget.checked)}
        />
      )}

      <ScrollArea flex={1} mt="xs">
        <Stack gap={6}>
          {visible.map((thread) => (
            <Thread
              key={thread.root.id}
              thread={thread}
              ownActor={ownActor}
              canWrite={canWrite}
              candidates={candidates}
              documentId={documentId}
              highlighted={thread.root.id === highlightedThreadId}
            />
          ))}
          {visible.length === 0 && (
            <Text size="xs" c="dimmed">
              No comments yet.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
