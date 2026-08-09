import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { getAuthToken } from '../features/auth/store';
import {
  agoraErrorText,
  COMMENT_LINK_PARAM,
  LIVE_DOCUMENT_PARAM,
  resolveShareLink,
  SHARE_LINK_PARAM,
} from './api';
import { useLiveStore } from './liveStore';

export async function joinLiveFromToken(token: string): Promise<void> {
  const { doc, role, sessionToken } = await resolveShareLink(token);
  useLiveStore.getState().connect({ documentId: doc, token: sessionToken, role, guest: true });
}

function reportJoinFailure(failure: unknown): void {
  notifications.show({
    title: 'Live link failed',
    message: agoraErrorText(failure, 'Could not open that link.'),
    color: 'red',
  });
}

/**
 * Opens the document the URL points at, once, on first load: a share link
 * (`live` token), or a member deep link (`doc` id, needs a signed in member).
 * A `comment` id on either focuses that thread once its comment arrives.
 */
export function useJoinLiveFromLink(): void {
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shareToken = params.get(SHARE_LINK_PARAM);
    const documentId = params.get(LIVE_DOCUMENT_PARAM);
    const commentId = params.get(COMMENT_LINK_PARAM);
    const focus = () => {
      if (commentId) useLiveStore.getState().focusComment(commentId);
    };

    if (shareToken) {
      joinLiveFromToken(shareToken).then(focus).catch(reportJoinFailure);
      return;
    }
    if (!documentId) return;
    if (getAuthToken() === null) {
      notifications.show({
        title: 'Sign in to open this live map',
        message: 'This link needs a signed in member of the document.',
        color: 'orange',
      });
      return;
    }
    useLiveStore.getState().connect({ documentId });
    focus();
  }, []);
}
