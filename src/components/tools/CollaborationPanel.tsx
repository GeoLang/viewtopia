import { useState, useRef, useEffect } from 'react';
import {
  Paper,
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
import { IconUsers, IconX, IconSend, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useCollabStore } from '../../store/collaboration';

export function CollaborationPanel({ onClose }: { onClose: () => void }) {
  const {
    connected,
    roomId,
    userId,
    userName,
    users,
    messages,
    followUserId,
    connect,
    disconnect,
    setUserName,
    sendChat,
    setFollow,
  } = useCollabStore();

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
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconUsers size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Collaboration
          </Text>
          {connected && (
            <Badge size="xs" variant="light" color="green">
              {users.length} online
            </Badge>
          )}
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        {!connected ? (
          <>
            <TextInput
              size="xs"
              label="Your Name"
              placeholder="Anonymous"
              value={nameInput}
              onChange={(e) => setNameInput(e.currentTarget.value)}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <TextInput
              size="xs"
              label="Room ID"
              placeholder="Enter a room name…"
              value={roomInput}
              onChange={(e) => setRoomInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
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

            <Divider color="#30363d" />
            <Text size="xs" c="dimmed" fw={600}>Users</Text>

            {users.map((u) => (
              <Group key={u.userId} gap="xs" justify="space-between">
                <Group gap="xs">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: u.color,
                    }}
                  />
                  <Text size="xs" c="white">
                    {u.userName}
                    {u.userId === userId ? ' (you)' : ''}
                  </Text>
                </Group>
                {u.userId !== userId && (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color={followUserId === u.userId ? 'violet' : 'gray'}
                    title={followUserId === u.userId ? 'Stop following' : 'Follow view'}
                    onClick={() =>
                      setFollow(followUserId === u.userId ? null : u.userId)
                    }
                  >
                    {followUserId === u.userId ? (
                      <IconEyeOff size={12} />
                    ) : (
                      <IconEye size={12} />
                    )}
                  </ActionIcon>
                )}
              </Group>
            ))}

            <Divider color="#30363d" />
            <Text size="xs" c="dimmed" fw={600}>Chat</Text>

            <ScrollArea mah={150} style={{ background: '#0d1117', borderRadius: 4, padding: 4 }}>
              {messages.map((m, i) => (
                <Text key={i} size="xs" c={m.userId === userId ? '#a78bfa' : 'white'}>
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
                styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
              />
              <ActionIcon
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
    </Paper>
  );
}
