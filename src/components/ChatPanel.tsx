import {
  Stack,
  ScrollArea,
  Textarea,
  ActionIcon,
  Group,
  Text,
  Select,
  Tooltip,
  Loader,
} from '@mantine/core';
import { IconSend, IconPlus, IconTrash, IconSquare } from '@tabler/icons-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { interceptConfirmReply } from '../actions/dispatch';
import { PlanPanel } from '../features/workflow/PlanPanel';
import { renderUISpec } from '../viewer/uiSpec';
import { executeViewerCommand } from '../viewer/commands';
import { useChatStore, type Message } from '../store/chat';
import { useSSE } from '../hooks/useSSE';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { DictationButton } from '../speech/DictationButton';
import { useDictation } from '../speech/useDictation';
import { useSpeechAvailability } from '../speech/availability';
import { withTypedPrefix } from '../speech/segments';

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

  const speechAvailable = useSpeechAvailability((s) => s.available);
  const probeSpeech = useSpeechAvailability((s) => s.probe);
  useEffect(() => {
    void probeSpeech();
  }, [probeSpeech]);
  // what was typed before the mic went on, the transcript follows it
  const typedBeforeDictation = useRef('');
  const dictation = useDictation((transcript) =>
    setInput(withTypedPrefix(typedBeforeDictation.current, transcript)),
  );
  const toggleDictation = () => {
    if (dictation.state !== 'idle') {
      dictation.stop();
      return;
    }
    typedBeforeDictation.current = input;
    dictation.start();
  };

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

  // a read action's result goes back to the model as its own turn, once the run
  // that produced it has finished
  const followUp = useChatStore((s) => s.followUp);
  useEffect(() => {
    if (!followUp || streaming) return;
    const prompt = useChatStore.getState().takeFollowUp();
    if (prompt) void send(prompt, { followUp: true });
  }, [followUp, streaming, send]);

  const handleSend = () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    // the mic stays live across a send, so the next sentence needs no click
    if (dictation.state === 'idle') dictation.stop();
    else dictation.takeTranscript();
    typedBeforeDictation.current = '';
    setInput('');
    setHistoryIndex(-1);
    draftRef.current = '';
    // a pending destructive action reads the reply itself
    if (interceptConfirmReply(prompt)) return;
    send(prompt);
  };

  // Enter sends from anywhere, so a live mic does not need the cursor put back
  // in the box first. The hook leaves fields and focused buttons alone.
  useKeyboardShortcuts({ enter: handleSend });

  /** Step through sent prompts: +1 goes further back, -1 back toward the draft. */
  const recallPrompt = useCallback(
    (delta: number) => {
      const next = historyIndex + delta;
      if (next < -1 || next >= promptHistory.length) return;
      if (historyIndex === -1) draftRef.current = input;
      setHistoryIndex(next);
      setInput(next === -1 ? draftRef.current : promptHistory[next]);
    },
    [historyIndex, promptHistory, input],
  );

  // capture so Chrome does not steal ArrowUp for field history
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        recallPrompt(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        recallPrompt(-1);
      }
    };
    el.addEventListener('keydown', onKeyDown, true);
    return () => el.removeEventListener('keydown', onKeyDown, true);
  }, [recallPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sessionOptions = sessions.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <Stack h="100%" gap={0}>
      {/* Session bar */}
      <Group p="xs" gap="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
        <Select
          size="xs"
          flex={1}
          data={sessionOptions}
          value={activeSessionId}
          onChange={(v) => v && setActiveSession(v)}
        />
        <Tooltip label="New session">
          <ActionIcon aria-label="New session"
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
            <ActionIcon aria-label="Delete session"
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
                    msg.role === 'user' ? 'var(--mantine-color-violet-7)' : 'var(--mantine-color-dark-6)',
                  padding: '6px 10px',
                  borderRadius: 8,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                  cursor: replayable ? 'pointer' : undefined,
                  borderLeft: replayable ? '2px solid var(--mantine-color-violet-4)' : undefined,
                }}
              >
                {msg.content}
              </Text>
              {msg.error && (
                <Text
                  size="sm"
                  c="red.4"
                  style={{
                    display: 'block',
                    background: '#2d1517',
                    border: '1px solid #f8514966',
                    padding: '6px 10px',
                    borderRadius: 8,
                    maxWidth: '85%',
                    whiteSpace: 'pre-wrap',
                    marginTop: 4,
                  }}
                >
                  ⚠ {msg.error}
                </Text>
              )}
              {msg.plan && <PlanPanel messageId={msg.id} plan={msg.plan} />}
            </div>
            );
          })
        )}
        {/* stays up through tool calls, which is where a slow model spends its time */}
        {streaming && (
          <Group gap={6} mb={8}>
            <Loader type="dots" size="xs" color="violet" />
          </Group>
        )}
      </ScrollArea>

      {/* unnamed textarea so Chrome does not treat this as login */}
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
      <Group p="sm" gap="xs" style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}>
        <Textarea
          ref={promptRef}
          flex={1}
          size="sm"
          autosize
          minRows={1}
          maxRows={4}
          autoComplete="off"
          aria-label="Message"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          styles={{ input: { resize: 'none' } }}
        />
        {speechAvailable && (
          <DictationButton state={dictation.state} disabled={streaming} onToggle={toggleDictation} />
        )}
        {streaming ? (
          <ActionIcon aria-label="Stop generating" variant="filled" color="red" size="lg" onClick={abort}>
            <IconSquare size={14} />
          </ActionIcon>
        ) : (
          <ActionIcon aria-label="Send message"
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
      </form>
    </Stack>
  );
}
