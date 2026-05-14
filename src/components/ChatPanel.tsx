import {
  Stack,
  ScrollArea,
  TextInput,
  ActionIcon,
  Group,
  Text,
  Select,
  Button,
  Loader,
  Tooltip,
} from '@mantine/core';
import { IconSend, IconPlus, IconTrash, IconSquare } from '@tabler/icons-react';
import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chat';
import { useSSE } from '../hooks/useSSE';

export function ChatPanel() {
  const {
    sessions,
    activeSessionId,
    streaming,
    createSession,
    deleteSession,
    setActiveSession,
    activeMessages,
  } = useChatStore();
  const messages = activeMessages();
  const { send, abort } = useSSE();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-create first session
  useEffect(() => {
    if (sessions.length === 0) {
      createSession('Session 1');
    }
  }, [sessions.length, createSession]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput('');
  };

  const sessionOptions = sessions.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <Stack h="100%" gap={0}>
      {/* Session bar */}
      <Group p="xs" gap="xs" style={{ borderBottom: '1px solid #30363d' }}>
        <Select
          size="xs"
          flex={1}
          data={sessionOptions}
          value={activeSessionId}
          onChange={(v) => v && setActiveSession(v)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Tooltip label="New session">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="violet"
            onClick={() => createSession()}
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
        {activeSessionId && (
          <Tooltip label="Delete session">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => deleteSession(activeSessionId)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {/* Messages */}
      <ScrollArea flex={1} p="sm" viewportRef={scrollRef}>
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
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content || (streaming && msg.role === 'assistant' ? '…' : '')}
              </Text>
            </div>
          ))
        )}
      </ScrollArea>

      {/* Input */}
      <Group p="sm" gap="xs" style={{ borderTop: '1px solid #30363d' }}>
        <TextInput
          flex={1}
          size="sm"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={streaming}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        {streaming ? (
          <ActionIcon variant="filled" color="red" size="lg" onClick={abort}>
            <IconSquare size={14} />
          </ActionIcon>
        ) : (
          <ActionIcon
            variant="filled"
            color="violet"
            size="lg"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <IconSend size={16} />
          </ActionIcon>
        )}
      </Group>
    </Stack>
  );
}
