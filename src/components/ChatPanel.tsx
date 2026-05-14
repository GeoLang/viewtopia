import { Stack, ScrollArea, TextInput, ActionIcon, Group, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setInput('');
    // TODO: Wire to GeoLang SSE backend
  };

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea flex={1} p="sm">
        {messages.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" mt="xl">
            Ask the AI agent anything about the map…
          </Text>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: 8,
                textAlign: msg.role === 'user' ? 'right' : 'left',
              }}
            >
              <Text
                size="sm"
                c={msg.role === 'user' ? 'white' : 'gray.3'}
                style={{
                  display: 'inline-block',
                  background:
                    msg.role === 'user' ? '#7c3aed' : '#21262d',
                  padding: '6px 10px',
                  borderRadius: 8,
                  maxWidth: '85%',
                }}
              >
                {msg.content}
              </Text>
            </div>
          ))
        )}
      </ScrollArea>

      <Group p="sm" gap="xs" style={{ borderTop: '1px solid #30363d' }}>
        <TextInput
          flex={1}
          size="sm"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          styles={{
            input: { background: '#161b22', borderColor: '#30363d' },
          }}
        />
        <ActionIcon
          variant="filled"
          color="violet"
          size="lg"
          onClick={handleSend}
        >
          <IconSend size={16} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
