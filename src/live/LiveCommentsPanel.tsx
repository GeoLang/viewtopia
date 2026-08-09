import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconCornerDownRight,
  IconDownload,
  IconLink,
  IconMapPin,
  IconMessage,
  IconTrash,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../components/PanelCard';
import { downloadFile } from '../features/spacetime/analysis/export';
import { commentLinkUrl, fetchLiveDocument } from './api';
import { commentExportFilename, commentsAsCsv, commentsAsGeoJson } from './commentExport';
import {
  commentTextSegments,
  commentThreads,
  currentMapAnchor,
  deleteComment,
  deleteCommentThread,
  flyToComment,
  postComment,
  setCommentResolved,
  type CommentThread,
} from './comments';
import { useLiveStore } from './liveStore';
import { MentionTextarea } from './MentionTextarea';
import type { LiveComment, LiveCommentMention } from './types';

/**
 * Who the compose boxes can @mention: the document's members, named by their
 * peer entry when they are online. A share link guest cannot list members, so
 * a guest composes without suggestions.
 */
function useMentionCandidates(canWrite: boolean): LiveCommentMention[] {
  const documentId = useLiveStore((s) => s.documentId);
  const ownActor = useLiveStore((s) => s.actor);
  const peers = useLiveStore((s) => s.peers);
  const guest = useLiveStore((s) => s.guest);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!canWrite || guest || !documentId) return;
    let stale = false;
    fetchLiveDocument(documentId)
      .then((detail) => {
        if (!stale) setMemberIds(detail.members.map((member) => member.userId));
      })
      .catch(() => {
        if (!stale) setMemberIds([]);
      });
    return () => {
      stale = true;
    };
  }, [canWrite, guest, documentId]);

  return memberIds
    .filter((userId) => userId !== ownActor)
    .map((userId) => ({
      userId,
      name: peers.find((peer) => peer.actor === userId)?.name || userId,
    }));
}

function writtenAt(comment: LiveComment): string {
  return new Date(comment.createdAt).toLocaleString();
}

function CommentBody({
  comment,
  ownActor,
  canWrite,
  onDelete,
}: {
  comment: LiveComment;
  ownActor: string | null;
  canWrite: boolean;
  onDelete: () => void;
}) {
  return (
    <Stack gap={2}>
      <Group gap={6} justify="space-between" wrap="nowrap">
        <Text size="xs" c="white" fw={600} truncate>
          {comment.authorName}
        </Text>
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed">
            {writtenAt(comment)}
          </Text>
          {comment.anchor && (
            <Tooltip label="Fly to this spot">
              <ActionIcon
                size="xs"
                variant="subtle"
                color="violet"
                aria-label="Fly to this spot"
                onClick={() => flyToComment(comment)}
              >
                <IconMapPin size={11} />
              </ActionIcon>
            </Tooltip>
          )}
          {canWrite && comment.actor === ownActor && (
            <Tooltip label="Delete">
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                aria-label={`Delete comment by ${comment.authorName}`}
                onClick={onDelete}
              >
                <IconTrash size={11} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Text size="xs" c="dark.0" style={{ whiteSpace: 'pre-wrap' }}>
        {commentTextSegments(comment).map((segment, index) =>
          segment.mention ? (
            <Text key={index} span size="xs" c="violet.4" fw={600}>
              {segment.text}
            </Text>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </Text>
    </Stack>
  );
}

function Thread({
  thread,
  ownActor,
  canWrite,
  candidates,
  documentId,
  highlighted,
}: {
  thread: CommentThread;
  ownActor: string | null;
  canWrite: boolean;
  candidates: LiveCommentMention[];
  documentId: string;
  highlighted: boolean;
}) {
  const [replyText, setReplyText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMentions, setReplyMentions] = useState<LiveCommentMention[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView?.({ block: 'center' });
  }, [highlighted]);

  const sendReply = () => {
    if (!postComment({ text: replyText, parentId: thread.root.id, mentions: replyMentions }))
      return;
    setReplyText('');
    setReplyMentions([]);
    setReplyOpen(false);
  };

  return (
    <Stack
      ref={cardRef}
      gap={6}
      p="xs"
      data-testid="comment-thread"
      data-highlighted={highlighted || undefined}
      style={{
        background: 'var(--mantine-color-dark-6)',
        borderRadius: 4,
        opacity: thread.root.resolved ? 0.6 : 1,
        outline: highlighted ? '2px solid var(--mantine-color-violet-5)' : undefined,
      }}
    >
      <CommentBody
        comment={thread.root}
        ownActor={ownActor}
        canWrite={canWrite}
        onDelete={() => deleteCommentThread(thread)}
      />
      {thread.replies.length > 0 && (
        <Stack gap={6} pl="sm" style={{ borderLeft: '1px solid var(--mantine-color-dark-5)' }}>
          {thread.replies.map((reply) => (
            <CommentBody
              key={reply.id}
              comment={reply}
              ownActor={ownActor}
              canWrite={canWrite}
              onDelete={() => deleteComment(reply)}
            />
          ))}
        </Stack>
      )}

      <Group gap="xs" wrap="nowrap">
        {canWrite && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="violet"
            leftSection={<IconCornerDownRight size={11} />}
            onClick={() => setReplyOpen((open) => !open)}
          >
            Reply
          </Button>
        )}
        {canWrite && (
          <Button
            size="compact-xs"
            variant="subtle"
            color={thread.root.resolved ? 'gray' : 'green'}
            leftSection={<IconCheck size={11} />}
            data-testid="comment-resolve"
            onClick={() => setCommentResolved(thread.root, !thread.root.resolved)}
          >
            {thread.root.resolved ? 'Reopen' : 'Resolve'}
          </Button>
        )}
        <CopyButton value={commentLinkUrl(documentId, thread.root.id)}>
          {({ copied, copy }) => (
            <Button
              size="compact-xs"
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              leftSection={<IconLink size={11} />}
              data-testid="comment-copy-link"
              onClick={copy}
            >
              {copied ? 'Copied' : 'Link'}
            </Button>
          )}
        </CopyButton>
      </Group>

      {canWrite && replyOpen && (
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <MentionTextarea
            value={replyText}
            onChange={setReplyText}
            onPick={(mention) => setReplyMentions((picked) => [...picked, mention])}
            candidates={candidates}
            placeholder="Reply…"
            ariaLabel={`Reply to ${thread.root.authorName}`}
            minRows={1}
            maxRows={4}
          />
          <Button
            size="compact-xs"
            color="violet"
            disabled={!replyText.trim()}
            data-testid="comment-reply-submit"
            onClick={sendReply}
          >
            Send
          </Button>
        </Group>
      )}
    </Stack>
  );
}

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
