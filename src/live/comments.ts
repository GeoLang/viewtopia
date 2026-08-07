import { useAuthStore } from '../features/auth/store';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { getSharedCamera } from '../hooks/sharedCamera';
import { useLiveStore } from './liveStore';
import { documentKey, type LiveComment, type LiveCommentAnchor, type LiveOperation } from './types';

/**
 * What the compose box accepts. The service caps an op value at 64 KiB, which is
 * the backstop rather than a length anyone should discover by hitting it.
 */
export const COMMENT_TEXT_LIMIT = 4000;

const UNNAMED_AUTHOR = 'Someone';

/** A top level comment and the replies that answer it, oldest first. */
export interface CommentThread {
  root: LiveComment;
  replies: LiveComment[];
}

export interface CommentAuthor {
  actor: string;
  name: string;
}

function byAge(left: LiveComment, right: LiveComment): number {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.id.localeCompare(right.id);
}

/**
 * Group a flat comment map into threads. A reply whose parent is gone is dropped
 * with it, so a deleted thread never leaves a headless answer on screen.
 */
export function commentThreads(comments: Record<string, LiveComment>): CommentThread[] {
  const entries = Object.values(comments);
  const threads = new Map<string, CommentThread>();
  for (const comment of entries) {
    if (comment.parentId) continue;
    threads.set(comment.id, { root: comment, replies: [] });
  }
  for (const comment of entries) {
    if (!comment.parentId) continue;
    threads.get(comment.parentId)?.replies.push(comment);
  }
  const ordered = [...threads.values()];
  for (const thread of ordered) thread.replies.sort(byAge);
  ordered.sort((left, right) => byAge(left.root, right.root));
  return ordered;
}

/**
 * Who a comment written now would be attributed to. The name is stored on the
 * comment rather than looked up on render, so a share link guest's comments keep
 * their name once the guest is gone.
 */
export function currentCommentAuthor(): CommentAuthor | null {
  const { actor, peers } = useLiveStore.getState();
  if (actor === null) return null;
  const peer = peers.find((candidate) => candidate.actor === actor);
  const user = useAuthStore.getState().user;
  return { actor, name: peer?.name || user?.name || user?.email || UNNAMED_AUTHOR };
}

/** Where the map is looking now, for a comment that wants to point at it. */
export function currentMapAnchor(): LiveCommentAnchor {
  const camera = getSharedCamera();
  return { lng: camera.longitude, lat: camera.latitude, zoom: camera.zoom };
}

export interface NewComment {
  text: string;
  parentId?: string;
  anchor?: LiveCommentAnchor | null;
}

/**
 * Write one comment onto the live log. Returns what was written, or null when
 * there is nothing to write or no session to write it to.
 */
export function postComment({ text, parentId, anchor }: NewComment): LiveComment | null {
  const trimmed = text.trim();
  const author = currentCommentAuthor();
  if (!author || trimmed.length === 0 || trimmed.length > COMMENT_TEXT_LIMIT) return null;
  const comment: LiveComment = {
    id: crypto.randomUUID(),
    actor: author.actor,
    authorName: author.name,
    text: trimmed,
    createdAt: Date.now(),
  };
  if (parentId) comment.parentId = parentId;
  else comment.resolved = false;
  if (anchor) comment.anchor = anchor;
  useLiveStore.getState().sendOperation(documentKey('comments', comment.id), comment);
  return comment;
}

/** Resolving is a last writer wins edit of the thread's own value. */
export function setCommentResolved(root: LiveComment, resolved: boolean): void {
  useLiveStore.getState().sendOperation(documentKey('comments', root.id), { ...root, resolved });
}

/**
 * Delete a whole thread as one frame, so peers never see the replies without the
 * comment they answer.
 */
export function deleteCommentThread(thread: CommentThread): void {
  const operations: LiveOperation[] = [thread.root, ...thread.replies].map((comment) => ({
    key: documentKey('comments', comment.id),
    value: null,
  }));
  useLiveStore.getState().sendOperations(operations);
}

export function deleteComment(comment: LiveComment): void {
  useLiveStore.getState().sendOperation(documentKey('comments', comment.id), null);
}

export function flyToComment(comment: LiveComment): void {
  if (!comment.anchor) return;
  const { lng, lat, zoom } = comment.anchor;
  useSpaceTimeStore.getState().flyTo(lng, lat, zoom);
}
