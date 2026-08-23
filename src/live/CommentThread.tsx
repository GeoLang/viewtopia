import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCornerDownRight, IconLink, IconMapPin, IconTrash } from '@tabler/icons-react';
import { commentLinkUrl, fetchLiveDocument } from './api';
import {
  commentTextSegments,
  deleteComment,
  deleteCommentThread,
  flyToComment,
  postComment,
  setCommentResolved,
  type CommentThread as CommentThreadValue,
} from './comments';
import { useLiveStore } from './liveStore';
import { MentionTextarea } from './MentionTextarea';
import type { LiveComment, LiveCommentMention } from './types';

/**
 * Who the compose boxes can @mention: the document's members, named by their
 * peer entry when they are online. A share link guest cannot list members, so
 * a guest composes without suggestions.
 */
export function useMentionCandidates(canWrite: boolean): LiveCommentMention[] {
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

export function CommentBody({
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

export function Thread({
  thread,
  ownActor,
  canWrite,
  candidates,
  documentId,
  highlighted,
}: {
  thread: CommentThreadValue;
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
