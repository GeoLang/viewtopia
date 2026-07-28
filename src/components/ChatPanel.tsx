import {
  Stack,
  ScrollArea,
  TextInput,
  ActionIcon,
  Group,
  Text,
  Select,
  Tooltip,
  Loader,
} from '@mantine/core';
import { IconSend, IconPlus, IconTrash, IconSquare } from '@tabler/icons-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { renderUISpec } from '../viewer/uiSpec';
import { executeViewerCommand } from '../viewer/commands';
import { useChatStore, type Message } from '../store/chat';
import { useSSE } from '../hooks/useSSE';

/** Re-run everything a reply did to the map: its viewer commands, then its map spec. */
function replayMessage(msg: Message) {
  for (const cmd of msg.viewerCmds ?? []) executeViewerCommand(cmd);
  if (msg.mapSpec) void renderUISpec(msg.mapSpec);
}

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

  // Prompts already sent in this session, most recent first. -1 means the input
  // holds a fresh draft rather than a recalled prompt.
  const promptHistory = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .reverse(),
    [messages],
  );
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');

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

  // Browsing back to an older session shouldn't leave the index pointing past
  // the end of that session's history.
  useEffect(() => {
    setHistoryIndex(-1);
    draftRef.current = '';
  }, [activeSessionId]);

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput('');
    setHistoryIndex(-1);
    draftRef.current = '';
  };

  /** Step through sent prompts: +1 goes further back, -1 back toward the draft. */
  const recallPrompt = (delta: number) => {
    const next = historyIndex + delta;
    if (next < -1 || next >= promptHistory.length) return;
    if (historyIndex === -1) draftRef.current = input;
    setHistoryIndex(next);
    setInput(next === -1 ? draftRef.current : promptHistory[next]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      recallPrompt(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      recallPrompt(-1);
    }
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
          messages.map((msg) => {
            const replayable = Boolean(msg.mapSpec || msg.viewerCmds?.length);
            return (
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
                title={replayable ? 'Click to replay this result on the map' : undefined}
                onClick={replayable ? () => replayMessage(msg) : undefined}
                style={{
                  display: 'inline-block',
                  background:
                    msg.role === 'user' ? '#7c3aed' : '#21262d',
                  padding: '6px 10px',
                  borderRadius: 8,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                  cursor: replayable ? 'pointer' : undefined,
                  borderLeft: replayable ? '2px solid #a78bfa' : undefined,
                }}
              >
                {msg.content ||
                  (streaming && msg.role === 'assistant' ? (
                    <Loader type="dots" size="xs" color="violet" />
                  ) : (
                    ''
                  ))}
              </Text>
            </div>
            );
          })
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
          onKeyDown={handleKeyDown}
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
