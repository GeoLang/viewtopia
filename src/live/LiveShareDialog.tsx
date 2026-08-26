import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { cameraHashFragment } from '../hooks/useShareLinkHash';
import { useAgentLayerStore } from '../store/agentLayers';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';
import { useAppStore } from '../store/app';
import {
  agoraErrorText,
  createFeed,
  createShareLink,
  deleteFeed,
  embedSnippet,
  fetchLiveDocument,
  listFeeds,
  removeLiveMember,
  setLiveMember,
  shareLinkUrl,
  type LiveFeed,
  type LiveMember,
} from './api';
import {
  FALLBACK_ASSET_COLOR,
  FALLBACK_OFFLINE_COLOR,
  saveAssetRule,
} from './assetRule';
import { formatBreakpoints, parseBreakpoints } from './assetState';
import { useLiveStore } from './liveStore';
import { ASSET_RULE_ID, type LiveRole } from './types';

const MEMBER_ROLE_CHOICES = [
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

/** What a new feed suggests, matching how often a sensor usually reports. */
const DEFAULT_FEED_INTERVAL_SECONDS = 10;

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

  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [feedError, setFeedError] = useState('');
  const [feedName, setFeedName] = useState('');
  const [feedInterval, setFeedInterval] = useState(String(DEFAULT_FEED_INTERVAL_SECONDS));
  const [feedToken, setFeedToken] = useState('');
  const [creatingFeed, setCreatingFeed] = useState(false);

  const [ruleLayerId, setRuleLayerId] = useState('');
  const [ruleKind, setRuleKind] = useState('');
  const [ruleBreakpoints, setRuleBreakpoints] = useState('');
  const [ruleDefaultColor, setRuleDefaultColor] = useState(FALLBACK_ASSET_COLOR);
  const [ruleOfflineColor, setRuleOfflineColor] = useState(FALLBACK_OFFLINE_COLOR);

  // a share link guest holds a session token these routes reject, so they get
  // no members section at all, signed in to the platform or not. the role only
  // describes the document the store is connected to, so it answers for nothing
  // else.
  const guest = useLiveStore((state) => state.guest);
  const liveDocumentId = useLiveStore((state) => state.documentId);
  const liveRole = useLiveStore((state) => state.role);
  const canManageDocument = !guest && liveDocumentId === documentId && liveRole === 'edit';

  const agentLayers = useAgentLayerStore((state) => state.layers);
  const tiles3dLayers = useTiles3dLayerStore((state) => state.layers);
  const rule = useLiveStore((state) => state.document.assets[ASSET_RULE_ID]);

  const renderer = useAppStore((state) => state.renderer);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const { token } = await createShareLink(documentId, role);
      // the document syncs layers and annotations but holds no camera, so the
      // link carries the sharer's current view as the landing point
      setLink(`${shareLinkUrl(token)}#${cameraHashFragment(renderer)}`);
    } catch (failure) {
      setError(agoraErrorText(failure, 'Could not create the link.'));
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
      setMemberError(agoraErrorText(failure, 'Could not load the members.'));
    }
  }, [documentId]);

  useEffect(() => {
    if (!opened || !canManageDocument) return;
    void refreshMembers();
  }, [opened, canManageDocument, refreshMembers]);

  const changeMemberRole = async (userId: string, next: LiveRole) => {
    setBusyMember(userId);
    setMemberError('');
    try {
      await setLiveMember(documentId, userId, next);
      await refreshMembers();
    } catch (failure) {
      setMemberError(agoraErrorText(failure, 'Could not change that role.'));
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
      setMemberError(agoraErrorText(failure, 'Could not remove that member.'));
    } finally {
      setBusyMember('');
    }
  };

  const refreshFeeds = useCallback(async () => {
    try {
      setFeeds(await listFeeds(documentId));
      setFeedError('');
    } catch (failure) {
      setFeeds([]);
      setFeedError(agoraErrorText(failure, 'Could not load the feeds.'));
    }
  }, [documentId]);

  useEffect(() => {
    if (!opened || !canManageDocument) return;
    void refreshFeeds();
  }, [opened, canManageDocument, refreshFeeds]);

  // the rule form opens on what the document already says, so a change edits
  // the rule rather than replacing it from blank fields
  useEffect(() => {
    if (!opened) return;
    setRuleLayerId(rule?.layerId ?? '');
    setRuleKind(rule?.kind ?? '');
    setRuleBreakpoints(rule ? formatBreakpoints(rule.breakpoints) : '');
    setRuleDefaultColor(rule?.defaultColor ?? FALLBACK_ASSET_COLOR);
    setRuleOfflineColor(rule?.offlineColor ?? FALLBACK_OFFLINE_COLOR);
  }, [opened, rule]);

  const addFeed = async () => {
    const name = feedName.trim();
    const intervalSeconds = Number(feedInterval);
    if (!name || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return;
    setCreatingFeed(true);
    setFeedError('');
    try {
      const created = await createFeed(documentId, name, intervalSeconds);
      setFeedToken(created.token);
      setFeedName('');
      await refreshFeeds();
    } catch (failure) {
      setFeedError(agoraErrorText(failure, 'Could not create the feed.'));
    } finally {
      setCreatingFeed(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    setFeedError('');
    try {
      await deleteFeed(documentId, feedId);
      await refreshFeeds();
    } catch (failure) {
      setFeedError(agoraErrorText(failure, 'Could not delete that feed.'));
    }
  };

  const submitAssetRule = () => {
    if (!ruleLayerId || !ruleKind.trim()) return;
    saveAssetRule({
      layerId: ruleLayerId,
      kind: ruleKind.trim(),
      breakpoints: parseBreakpoints(ruleBreakpoints),
      defaultColor: ruleDefaultColor,
      offlineColor: ruleOfflineColor,
    });
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
      setAddError(agoraErrorText(failure, 'Could not add that member.'));
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

        {canManageDocument && (
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

        {canManageDocument && (
          <Stack gap="xs" data-testid="live-feeds">
            <Divider label="Feeds" labelPosition="left" />
            {feeds.map((feed) => (
              <Group key={feed.id} gap="xs" wrap="nowrap" justify="space-between">
                <Text size="xs" c="white" truncate flex={1}>
                  {feed.name}
                </Text>
                <Text size="xs" c="dimmed">
                  every {feed.intervalSeconds}s
                </Text>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={`Delete ${feed.name}`}
                  data-testid={`feed-delete-${feed.id}`}
                  onClick={() => void removeFeed(feed.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
            {feeds.length === 0 && !feedError && (
              <Text size="xs" c="dimmed">
                No feeds yet.
              </Text>
            )}
            {feedError && (
              <Text size="xs" c="red" data-testid="feed-error">
                {feedError}
              </Text>
            )}

            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                flex={1}
                placeholder="Feed name…"
                value={feedName}
                onChange={(event) => setFeedName(event.currentTarget.value)}
                data-testid="feed-name"
              />
              <TextInput
                size="xs"
                w={70}
                aria-label="Interval in seconds"
                value={feedInterval}
                onChange={(event) => setFeedInterval(event.currentTarget.value)}
                data-testid="feed-interval"
              />
              <Button
                size="xs"
                variant="light"
                color="violet"
                loading={creatingFeed}
                onClick={() => void addFeed()}
                data-testid="feed-create"
              >
                Add
              </Button>
            </Group>
            {feedToken && (
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  size="xs"
                  flex={1}
                  readOnly
                  value={feedToken}
                  aria-label="Feed token"
                  data-testid="feed-token"
                />
                <CopyButton value={feedToken}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="light" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            )}
            <Text size="xs" c="dimmed">
              The token is shown once. A producer sends readings with it and
              nothing else can read it back.
            </Text>

            <Divider label="Asset rule" labelPosition="left" />
            <Select
              size="xs"
              placeholder="Asset layer"
              value={ruleLayerId || null}
              onChange={(next) => setRuleLayerId(next ?? '')}
              data={[...agentLayers, ...tiles3dLayers].map((layer) => ({
                value: layer.id,
                label: layer.name,
              }))}
              data-testid="asset-rule-layer"
            />
            <TextInput
              size="xs"
              placeholder="Reading kind, e.g. temperature"
              value={ruleKind}
              onChange={(event) => setRuleKind(event.currentTarget.value)}
              data-testid="asset-rule-kind"
            />
            <TextInput
              size="xs"
              placeholder="0:#2ecc71, 25:#f1c40f, 30:#e74c3c"
              value={ruleBreakpoints}
              onChange={(event) => setRuleBreakpoints(event.currentTarget.value)}
              data-testid="asset-rule-breakpoints"
            />
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                flex={1}
                aria-label="Default colour"
                value={ruleDefaultColor}
                onChange={(event) => setRuleDefaultColor(event.currentTarget.value)}
                data-testid="asset-rule-default"
              />
              <TextInput
                size="xs"
                flex={1}
                aria-label="Offline colour"
                value={ruleOfflineColor}
                onChange={(event) => setRuleOfflineColor(event.currentTarget.value)}
                data-testid="asset-rule-offline"
              />
              <Button
                size="xs"
                variant="light"
                color="violet"
                onClick={submitAssetRule}
                data-testid="asset-rule-save"
              >
                Save
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              A reading takes the colour of the last breakpoint at or below it.
            </Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
