import { useState, useRef, useEffect } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  ScrollArea,
  TextInput,
  Button,
  Divider,
} from '@mantine/core';
import { IconUsers, IconSend } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useCollabStore } from '../../store/collaboration';
import { useAuthStore } from '../../features/auth/store';

export function CollaborationPanel({ onClose }: { onClose: () => void }) {
  const {
    connected,
    roomId,
    userId,
    userName,
    users,
    messages,
    error,
    connect,
    disconnect,
    setUserName,
    sendChat,
  } = useCollabStore();

  // the room handshake needs the session JWT, so signed out there is nothing to join
  const loggedIn = useAuthStore((s) => s.loggedIn);

  const [roomInput, setRoomInput] = useState('');
  const [nameInput, setNameInput] = useState(userName);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleConnect = () => {
    const room = roomInput.trim();
    if (!room) return;
    if (nameInput.trim()) setUserName(nameInput.trim());
    connect(room);
  };

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    sendChat(msg);
    setChatInput('');
  };

  return (
    <PanelCard width={300}>
      <PanelHeader
        icon={<IconUsers size={16} />}
        title="Collaboration"
        onClose={onClose}
        badge={
          connected && (
            <Badge size="xs" variant="light" color="green">
              {users.length} online
            </Badge>
          )
        }
      />

      <Stack gap="xs">
        {!loggedIn ? (
          <Text size="xs" c="dimmed" py="md" ta="center" data-testid="collab-signin">
            Sign in to join a collaboration room.
          </Text>
        ) : !connected ? (
          <>
            {error && (
              <Text size="xs" c="red.4" data-testid="collab-error">
                {error}
              </Text>
            )}
            <TextInput
              size="xs"
              label="Your Name"
              placeholder="Anonymous"
              value={nameInput}
              onChange={(e) => setNameInput(e.currentTarget.value)}
            />
            <TextInput
              size="xs"
              label="Room ID"
              placeholder="Enter a room name…"
              value={roomInput}
              onChange={(e) => setRoomInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <Button size="xs" color="violet" onClick={handleConnect} disabled={!roomInput.trim()}>
              Join Room
            </Button>
          </>
        ) : (
          <>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Room: <Text span c="white" fw={500}>{roomId}</Text>
              </Text>
              <Button size="xs" color="red" variant="subtle" onClick={disconnect}>
                Leave
              </Button>
            </Group>

            <Divider color="var(--mantine-color-dark-5)" />
            <Text size="xs" c="dimmed" fw={600}>Users</Text>

            {users.map((u) => (
              <Group key={u.userId} gap="xs">
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: u.color,
                  }}
                />
                {/* a peer picks its own display name, so cap the room it gets */}
                <Text size="xs" c="white" maw={200} truncate>
                  {u.userName}
                  {u.userId === userId ? ' (you)' : ''}
                </Text>
              </Group>
            ))}

            <Divider color="var(--mantine-color-dark-5)" />
            <Text size="xs" c="dimmed" fw={600}>Chat</Text>

            <ScrollArea mah={150} style={{ background: 'var(--mantine-color-dark-8)', borderRadius: 4, padding: 4 }}>
              {messages.map((m, i) => (
                <Text
                  key={i}
                  size="xs"
                  c={m.userId === userId ? 'violet.4' : 'white'}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  <Text span fw={600}>{m.userName}: </Text>
                  {m.message}
                </Text>
              ))}
              <div ref={chatEndRef} />
            </ScrollArea>

            <Group gap="xs">
              <TextInput
                size="xs"
                placeholder="Message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                style={{ flex: 1 }}
              />
              <ActionIcon aria-label="Send message"
                size="sm"
                color="violet"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
              >
                <IconSend size={14} />
              </ActionIcon>
            </Group>
          </>
        )}
      </Stack>
    </PanelCard>
  );
}
