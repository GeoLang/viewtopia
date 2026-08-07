import { Avatar, Tooltip } from '@mantine/core';
import { useLiveStore } from './liveStore';
import { peerColor } from './MapPresence';

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
  if (peers.length === 0) return null;

  return (
    <Avatar.Group
      spacing="xs"
      data-testid="live-peers"
      style={{ opacity: connection === 'open' ? 1 : 0.5 }}
    >
      {peers.map((peer) => (
        <Tooltip key={peer.actor} label={`${peer.name} (${peer.role})`} withinPortal>
          <Avatar
            size="sm"
            radius="xl"
            aria-label={peer.name}
            styles={{
              placeholder: {
                background: peerColor(peer.actor),
                color: '#0d1117',
                fontWeight: 700,
                fontSize: 10,
              },
            }}
          >
            {initials(peer.name)}
          </Avatar>
        </Tooltip>
      ))}
    </Avatar.Group>
  );
}
