import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useAuthStore } from '../features/auth/store';
import {
  AgoraRequestError,
  createShareLink,
  embedSnippet,
  fetchLiveDocument,
  removeLiveMember,
  setLiveMember,
  shareLinkUrl,
  type LiveMember,
} from './api';
import { useLiveStore } from './liveStore';
import type { LiveRole } from './types';

const MEMBER_ROLE_CHOICES = [
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

function refusalText(failure: unknown, fallback: string): string {
  if (failure instanceof AgoraRequestError && failure.reason) return failure.reason;
  if (failure instanceof Error) return failure.message;
  return fallback;
}

export function LiveShareDialog({
  documentId,
  opened,
  onClose,
}: {
  documentId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState<LiveRole>('view');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<LiveMember[]>([]);
  const [memberError, setMemberError] = useState('');
  const [busyMember, setBusyMember] = useState('');
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<LiveRole>('view');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  // a share link guest holds a session token these routes reject, so they get
  // no members section at all. the role only describes the document the store is
  // connected to, so it answers for nothing else.
  const platformSignedIn = useAuthStore((state) => state.token) !== null;
  const liveDocumentId = useLiveStore((state) => state.documentId);
  const liveRole = useLiveStore((state) => state.role);
  const canManageMembers =
    platformSignedIn && liveDocumentId === documentId && liveRole === 'edit';

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const { token } = await createShareLink(documentId, role);
      setLink(shareLinkUrl(token));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'could not create the link');
    } finally {
      setCreating(false);
    }
  };

  const refreshMembers = useCallback(async () => {
    try {
      const detail = await fetchLiveDocument(documentId);
      setMembers(detail.members);
      setMemberError('');
    } catch (failure) {
      setMembers([]);
      setMemberError(refusalText(failure, 'could not load the members'));
    }
  }, [documentId]);

  useEffect(() => {
    if (!opened || !canManageMembers) return;
    void refreshMembers();
  }, [opened, canManageMembers, refreshMembers]);

  const changeMemberRole = async (userId: string, next: LiveRole) => {
    setBusyMember(userId);
    setMemberError('');
    try {
      await setLiveMember(documentId, userId, next);
      await refreshMembers();
    } catch (failure) {
      setMemberError(refusalText(failure, 'could not change that role'));
    } finally {
      setBusyMember('');
    }
  };

  const removeMember = async (userId: string) => {
    setBusyMember(userId);
    setMemberError('');
    try {
      await removeLiveMember(documentId, userId);
      await refreshMembers();
    } catch (failure) {
      setMemberError(refusalText(failure, 'could not remove that member'));
    } finally {
      setBusyMember('');
    }
  };

  const addMember = async () => {
    const userId = newMemberId.trim();
    if (!userId) return;
    setAdding(true);
    setAddError('');
    try {
      await setLiveMember(documentId, userId, newMemberRole);
      setNewMemberId('');
      await refreshMembers();
    } catch (failure) {
      setAddError(refusalText(failure, 'could not add that member'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Share this live map" size="md">
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          value={role}
          onChange={(next) => {
            setRole(next as LiveRole);
            setLink('');
          }}
          data={[
            { value: 'view', label: 'Can view' },
            { value: 'edit', label: 'Can edit' },
          ]}
        />
        <Button
          size="xs"
          color="violet"
          loading={creating}
          onClick={() => void create()}
          data-testid="create-share-link"
        >
          Create link
        </Button>
        {link && (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              flex={1}
              readOnly
              value={link}
              data-testid="share-link"
            />
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Button size="xs" variant="light" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
        )}
        {link && role === 'view' && (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              flex={1}
              readOnly
              value={embedSnippet(link)}
              aria-label="Embed snippet"
              data-testid="embed-snippet"
            />
            <CopyButton value={embedSnippet(link)}>
              {({ copied, copy }) => (
                <Button size="xs" variant="light" onClick={copy} data-testid="copy-embed-snippet">
                  {copied ? 'Copied' : 'Embed'}
                </Button>
              )}
            </CopyButton>
          </Group>
        )}
        {error && (
          <Text size="xs" c="red" data-testid="share-error">
            {error}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Anyone with the link joins this document. View links cannot edit.
        </Text>

        {canManageMembers && (
          <Stack gap="xs" data-testid="live-members">
            <Divider label="Members" labelPosition="left" />
            {members.map((member) => (
              <Group
                key={member.userId}
                gap="xs"
                wrap="nowrap"
                justify="space-between"
                data-testid={`live-member-${member.userId}`}
              >
                <Text size="xs" c="white" truncate flex={1}>
                  {member.userId}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={member.role}
                  disabled={busyMember === member.userId}
                  onChange={(next) => void changeMemberRole(member.userId, next as LiveRole)}
                  data={MEMBER_ROLE_CHOICES}
                  data-testid={`live-member-role-${member.userId}`}
                />
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={`Remove ${member.userId}`}
                  disabled={busyMember === member.userId}
                  onClick={() => void removeMember(member.userId)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
            {members.length === 0 && !memberError && (
              <Text size="xs" c="dimmed">
                No members to show.
              </Text>
            )}
            {memberError && (
              <Text size="xs" c="red" data-testid="live-member-error">
                {memberError}
              </Text>
            )}

            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                flex={1}
                placeholder="Platform user id…"
                value={newMemberId}
                onChange={(event) => setNewMemberId(event.currentTarget.value)}
                data-testid="new-member-id"
              />
              <SegmentedControl
                size="xs"
                value={newMemberRole}
                onChange={(next) => setNewMemberRole(next as LiveRole)}
                data={MEMBER_ROLE_CHOICES}
                data-testid="new-member-role"
              />
              <Button
                size="xs"
                variant="light"
                color="violet"
                loading={adding}
                onClick={() => void addMember()}
                data-testid="add-member"
              >
                Add
              </Button>
            </Group>
            {addError && (
              <Text size="xs" c="red" data-testid="add-member-error">
                {addError}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              Type the exact platform user id. There is no directory to search.
            </Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
