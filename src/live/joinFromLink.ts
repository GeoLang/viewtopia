import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { resolveShareLink, SHARE_LINK_PARAM } from './api';
import { useLiveStore } from './liveStore';

export async function joinLiveFromToken(token: string): Promise<void> {
  const { doc, role, sessionToken } = await resolveShareLink(token);
  useLiveStore.getState().connect({ documentId: doc, token: sessionToken, role });
}

/** Opens the document a share link points at, once, on first load. */
export function useJoinLiveFromLink(): void {
  useEffect(() => {
    const token = new URLSearchParams(location.search).get(SHARE_LINK_PARAM);
    if (!token) return;
    joinLiveFromToken(token).catch((failure: unknown) => {
      notifications.show({
        title: 'Live link failed',
        message: failure instanceof Error ? failure.message : 'could not open that link',
        color: 'red',
      });
    });
  }, []);
}
