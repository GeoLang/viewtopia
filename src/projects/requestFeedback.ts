import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../features/auth/store';

export function reportFailure(title: string, failure: unknown): void {
  notifications.show({
    title,
    message: failure instanceof Error ? failure.message : 'The request failed.',
    color: 'red',
  });
}

export function currentSession(token: string | null): boolean {
  return token !== null && useAuthStore.getState().token === token;
}
