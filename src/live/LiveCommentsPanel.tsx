import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconCornerDownRight,
  IconMapPin,
  IconMessage,
  IconTrash,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../components/PanelCard';
import { useAuthStore } from '../features/auth/store';
import { fetchLiveDocument } from './api';
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
  const signedIn = useAuthStore((s) => s.token) !== null;
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!canWrite || !signedIn || !documentId) return;
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
  }, [canWrite, signedIn, documentId]);

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
}: {
  thread: CommentThread;
  ownActor: string | null;
  canWrite: boolean;
  candidates: LiveCommentMention[];
}) {
  const [replyText, setReplyText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMentions, setReplyMentions] = useState<LiveCommentMention[]>([]);

  const sendReply = () => {
    if (!postComment({ text: replyText, parentId: thread.root.id, mentions: replyMentions }))
      return;
    setReplyText('');
    setReplyMentions([]);
    setReplyOpen(false);
  };

  return (
    <Stack
      gap={6}
      p="xs"
      data-testid="comment-thread"
      style={{
        background: 'var(--mantine-color-dark-6)',
        borderRadius: 4,
        opacity: thread.root.resolved ? 0.6 : 1,
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

      {canWrite && (
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-xs"
            variant="subtle"
            color="violet"
            leftSection={<IconCornerDownRight size={11} />}
            onClick={() => setReplyOpen((open) => !open)}
          >
            Reply
          </Button>
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
        </Group>
      )}

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

export function LiveCommentsPanel({ onClose }: { onClose: () => void }) {
  const comments = useLiveStore((s) => s.document.comments);
  const ownActor = useLiveStore((s) => s.actor);
  const role = useLiveStore((s) => s.role);
  const [text, setText] = useState('');
  const [withAnchor, setWithAnchor] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [mentions, setMentions] = useState<LiveCommentMention[]>([]);

  // no actor means the session has not told us who we are, so nothing to attribute to
  const canWrite = role === 'edit' && ownActor !== null;
  const candidates = useMentionCandidates(canWrite);
  const threads = commentThreads(comments);
  const visible = showResolved ? threads : threads.filter((thread) => !thread.root.resolved);
  const resolvedCount = threads.filter((thread) => thread.root.resolved).length;

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
          <Badge size="xs" variant="light" color="violet" data-testid="comment-count">
            {visible.length}
          </Badge>
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
