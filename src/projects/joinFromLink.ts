import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../features/auth/store';
import { joinProjectFromToken, PROJECT_INVITE_PARAM } from './sharing';

export function useJoinProjectFromLink(): void {
  const signedIn = useAuthStore((state) => state.loggedIn);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get(PROJECT_INVITE_PARAM);
    if (!token || !signedIn) return;
    joinProjectFromToken(token).catch((failure: unknown) => {
      notifications.show({
        title: 'Invite link failed',
        message: failure instanceof Error ? failure.message : 'Could not open that invite.',
        color: 'red',
      });
    });
  }, [signedIn]);
}
