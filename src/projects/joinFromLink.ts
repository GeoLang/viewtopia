import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { joinProjectFromToken, PROJECT_INVITE_PARAM } from './sharing';

/** The invite row has to already be in this browser's IndexedDB. */
export function useJoinProjectFromLink(): void {
  useEffect(() => {
    const token = new URLSearchParams(location.search).get(PROJECT_INVITE_PARAM);
    if (!token) return;
    joinProjectFromToken(token).catch((failure: unknown) => {
      notifications.show({
        title: 'Invite link failed',
        message: failure instanceof Error ? failure.message : 'Could not open that invite.',
        color: 'red',
      });
    });
  }, []);
}
