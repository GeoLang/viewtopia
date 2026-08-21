import { describe, it, expect, beforeEach, vi } from 'vitest';

const invites: Record<string, unknown>[] = [];

vi.mock('../../src/offline/db', () => ({
  shareInvites: {
    put: vi.fn(async (invite: { id: string }) => {
      invites.push(invite);
    }),
    get: vi.fn(async (id: string) => invites.find((row) => (row as { id: string }).id === id)),
    getByToken: vi.fn(async (token: string) =>
      invites.find((row) => (row as { token?: string; acceptedAt?: number }).token === token && !(row as { acceptedAt?: number }).acceptedAt),
    ),
    remove: vi.fn(async () => undefined),
    getByTarget: vi.fn(async () => []),
  },
  projects: {
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    getByWorkspace: vi.fn(async () => []),
  },
  workspaces: {
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
  },
  projectMaps: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../src/offline/sync', () => ({
  queueOperation: vi.fn(async () => {
    throw new Error('local projects must not queue a session sync');
  }),
}));

import {
  generateShareLink,
  PROJECT_INVITE_PARAM,
  projectInviteUrl,
} from '../../src/projects/sharing';

describe('local project share links', () => {
  beforeEach(() => {
    invites.length = 0;
  });

  it('points at a query param the SPA boots, not /join', async () => {
    const { url, invite } = await generateShareLink({
      targetType: 'project',
      targetId: 'proj-1',
      role: 'viewer',
    });
    expect(invite.token).toBeTruthy();
    expect(url).toBe(projectInviteUrl(invite.token as string));
    expect(url).toContain(`?${PROJECT_INVITE_PARAM}=`);
    expect(url).not.toContain('/join');
  });
});
