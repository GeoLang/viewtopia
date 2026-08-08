import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconCornerDownRight,
  IconMapPin,
  IconMessage,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  COMMENT_TEXT_LIMIT,
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
import type { LiveComment } from './types';

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
      <Text size="xs" c="#c9d1d9" style={{ whiteSpace: 'pre-wrap' }}>
        {comment.text}
      </Text>
    </Stack>
  );
}

function Thread({
  thread,
  ownActor,
  canWrite,
}: {
  thread: CommentThread;
  ownActor: string | null;
  canWrite: boolean;
}) {
  const [replyText, setReplyText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);

  const sendReply = () => {
    if (!postComment({ text: replyText, parentId: thread.root.id })) return;
    setReplyText('');
    setReplyOpen(false);
  };

  return (
    <Stack
      gap={6}
      p="xs"
      data-testid="comment-thread"
      style={{
        background: '#21262d',
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
        <Stack gap={6} pl="sm" style={{ borderLeft: '1px solid #30363d' }}>
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
          <Textarea
            size="xs"
            flex={1}
            autosize
            minRows={1}
            maxRows={4}
            maxLength={COMMENT_TEXT_LIMIT}
            placeholder="Reply…"
            aria-label={`Reply to ${thread.root.authorName}`}
            value={replyText}
            onChange={(event) => setReplyText(event.currentTarget.value)}
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

  // no actor means the session has not told us who we are, so nothing to attribute to
  const canWrite = role === 'edit' && ownActor !== null;
  const threads = commentThreads(comments);
  const visible = showResolved ? threads : threads.filter((thread) => !thread.root.resolved);
  const resolvedCount = threads.filter((thread) => thread.root.resolved).length;

  const send = () => {
    if (!postComment({ text, anchor: withAnchor ? currentMapAnchor() : null })) return;
    setText('');
    setWithAnchor(false);
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      data-testid="live-comments-panel"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 320,
        maxHeight: 'calc(100vh - 120px)',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMessage size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Comments
          </Text>
          <Badge size="xs" variant="light" color="violet" data-testid="comment-count">
            {visible.length}
          </Badge>
        </Group>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Close comments"
          onClick={onClose}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {canWrite ? (
        <Stack gap="xs">
          <Textarea
            size="xs"
            autosize
            minRows={2}
            maxRows={6}
            maxLength={COMMENT_TEXT_LIMIT}
            placeholder="Leave a comment…"
            aria-label="Leave a comment"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
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
            <Thread key={thread.root.id} thread={thread} ownActor={ownActor} canWrite={canWrite} />
          ))}
          {visible.length === 0 && (
            <Text size="xs" c="dimmed">
              No comments yet.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
