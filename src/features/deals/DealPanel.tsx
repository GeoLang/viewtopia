import { useState } from 'react';
import { ActionIcon, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconMessage, IconX } from '@tabler/icons-react';
import type { ParcelRecord } from '../../lib/realEstate';
import { commentThreads } from '../../live/comments';
import { useLiveStore } from '../../live/liveStore';
import {
  addToShortlist,
  attachComment,
  changeDealStatus,
  DEAL_STATUSES,
  type Deal,
  detachComment,
  removeFromShortlist,
  type ShortlistedSite,
  startDeal,
} from './deal';
import { useDealStore } from './store';

const COMMENT_EXCERPT_LENGTH = 60;

function excerpt(text: string): string {
  return text.length > COMMENT_EXCERPT_LENGTH ? `${text.slice(0, COMMENT_EXCERPT_LENGTH)}...` : text;
}

function parcelSite(parcel: ParcelRecord): ShortlistedSite {
  return { featureId: parcel.id, label: parcel.address || parcel.apn || parcel.id };
}

function StartDeal() {
  const [name, setName] = useState('');
  const setDeal = useDealStore((s) => s.setDeal);
  const trimmed = name.trim();
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        A deal holds this project's shortlisted sites, its status and the comment threads behind
        it. It saves with the project map, so every member sees the same deal.
      </Text>
      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          label="Deal name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          style={{ flex: 1 }}
          data-testid="deal-name"
        />
        <Button size="xs" disabled={!trimmed} onClick={() => setDeal(startDeal(trimmed))}>
          Start deal
        </Button>
      </Group>
    </Stack>
  );
}

function DealComments({ deal, update }: { deal: Deal; update: (deal: Deal) => void }) {
  const connected = useLiveStore((s) => s.documentId !== null);
  const comments = useLiveStore((s) => s.document.comments);
  const focusComment = useLiveStore((s) => s.focusComment);

  if (!connected) {
    return (
      <Text size="xs" c="dimmed" data-testid="deal-comments-offline">
        {deal.commentIds.length} comments attached. Join the project's live map to read them.
      </Text>
    );
  }

  const attachable = commentThreads(comments)
    .filter((thread) => !deal.commentIds.includes(thread.root.id))
    .map((thread) => ({
      value: thread.root.id,
      label: `${thread.root.authorName}: ${excerpt(thread.root.text)}`,
    }));

  return (
    <Stack gap={4}>
      {deal.commentIds.map((commentId) => {
        const comment = comments[commentId];
        return (
          <Group key={commentId} gap={4} wrap="nowrap">
            <IconMessage size={12} />
            <Text
              size="xs"
              style={{ flex: 1, cursor: comment ? 'pointer' : undefined }}
              c={comment ? undefined : 'dimmed'}
              onClick={comment ? () => focusComment(commentId) : undefined}
            >
              {comment
                ? `${comment.authorName}: ${excerpt(comment.text)}`
                : 'Comment deleted from the live map'}
            </Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              aria-label="Detach comment"
              onClick={() => update(detachComment(deal, commentId))}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        );
      })}
      <Select
        size="xs"
        placeholder={attachable.length > 0 ? 'Attach a comment thread' : 'No other comment threads'}
        data={attachable}
        value={null}
        disabled={attachable.length === 0}
        onChange={(commentId) => commentId && update(attachComment(deal, commentId))}
        data-testid="deal-attach-comment"
      />
    </Stack>
  );
}

export function DealPanel({ selectedParcels }: { selectedParcels: ParcelRecord[] }) {
  const deal = useDealStore((s) => s.deal);
  const setDeal = useDealStore((s) => s.setDeal);
  if (!deal) return <StartDeal />;

  const statusOptions = [deal.status, ...DEAL_STATUSES[deal.status].next].map((status) => ({
    value: status,
    label: DEAL_STATUSES[status].label,
  }));

  return (
    <Stack gap="xs" data-testid="deal-panel">
      <Group gap="xs" align="flex-end">
        <Text size="sm" fw={600} style={{ flex: 1 }}>
          {deal.name}
        </Text>
        <Select
          size="xs"
          label="Status"
          data={statusOptions}
          value={deal.status}
          allowDeselect={false}
          onChange={(value) => {
            const status = statusOptions.find((option) => option.value === value)?.value;
            if (status) setDeal(changeDealStatus(deal, status));
          }}
          data-testid="deal-status"
        />
      </Group>

      <Text size="xs" fw={600}>
        Shortlist
      </Text>
      {deal.shortlist.length === 0 && (
        <Text size="xs" c="dimmed">
          No sites yet. Add parcels to the selection in the Parcels tab, then add them here.
        </Text>
      )}
      {deal.shortlist.map((site) => (
        <Group key={site.featureId} gap={4} wrap="nowrap">
          <Text size="xs" style={{ flex: 1 }}>
            {site.label}
          </Text>
          <ActionIcon
            size="xs"
            variant="subtle"
            aria-label={`Remove ${site.label}`}
            onClick={() => setDeal(removeFromShortlist(deal, site.featureId))}
          >
            <IconX size={12} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="xs"
        variant="light"
        disabled={selectedParcels.length === 0}
        onClick={() => setDeal(addToShortlist(deal, selectedParcels.map(parcelSite)))}
      >
        Add selected parcels ({selectedParcels.length})
      </Button>

      <Text size="xs" fw={600}>
        Comments
      </Text>
      <DealComments deal={deal} update={setDeal} />
    </Stack>
  );
}
