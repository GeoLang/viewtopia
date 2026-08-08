import { Avatar, Tooltip } from '@mantine/core';
import { useLiveStore } from './liveStore';
import { peerColor } from './MapPresence';

const FOLLOWED_OUTLINE = '2px solid var(--mantine-color-violet-4)';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function LivePeers() {
  const peers = useLiveStore((s) => s.peers);
  const connection = useLiveStore((s) => s.connection);
  const followedActor = useLiveStore((s) => s.followedActor);
  const setFollowedActor = useLiveStore((s) => s.setFollowedActor);
  if (peers.length === 0) return null;

  return (
    <Avatar.Group
      spacing="xs"
      data-testid="live-peers"
      style={{ opacity: connection === 'open' ? 1 : 0.5 }}
    >
      {peers.map((peer) => {
        const followed = peer.actor === followedActor;
        return (
          <Tooltip
            key={peer.actor}
            label={
              followed
                ? `Following ${peer.name}, click to stop`
                : `${peer.name} (${peer.role}), click to follow`
            }
            withinPortal
          >
            <Avatar
              component="button"
              type="button"
              size="sm"
              radius="xl"
              aria-label={peer.name}
              aria-pressed={followed}
              onClick={() => setFollowedActor(followed ? null : peer.actor)}
              style={{ cursor: 'pointer', outline: followed ? FOLLOWED_OUTLINE : undefined }}
              styles={{
                placeholder: {
                  background: peerColor(peer.actor),
                  color: 'var(--mantine-color-dark-8)',
                  fontWeight: 700,
                  fontSize: 10,
                },
              }}
            >
              {initials(peer.name)}
            </Avatar>
          </Tooltip>
        );
      })}
    </Avatar.Group>
  );
}
