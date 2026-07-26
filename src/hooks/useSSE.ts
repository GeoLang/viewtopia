import { useCallback, useRef } from 'react';
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import type { Message } from '@ag-ui/core';
import { useChatStore } from '../store/chat';
import { useAppStore } from '../store/app';
import { executeViewerCommand, type ViewerCommand } from '../viewer/commands';
import { renderUISpec, type UiSpec } from '../viewer/uiSpec';

/** Store setters the AG-UI subscriber writes through, so it can be tested in isolation. */
interface AgUiHandlers {
  setLastContent: (content: string) => void;
  setLastMapSpec: (spec: UiSpec) => void;
  addLastViewerCmd: (cmd: ViewerCommand) => void;
}

/**
 * Build the AgentSubscriber that maps AG-UI events onto the same store setters /
 * renderers the legacy SSE path uses. Exported so the mapping can be unit-tested
 * without a live agent.
 *
 * text delta → append to assistant message (setLastContent, like legacy `text`);
 * custom `progress` → show only while no assistant text has arrived yet;
 * custom `viewer_cmd` → executeViewerCommand + keep it on the message for replay;
 * custom `ui_spec` → keep the spec on the message + renderUISpec; run error →
 * setLastContent (legacy `error`).
 */
export function buildAgUiSubscriber({ setLastContent, setLastMapSpec, addLastViewerCmd }: AgUiHandlers): AgentSubscriber {
  let lastText = '';
  return {
    onTextMessageContentEvent({ event }) {
      lastText += event.delta;
      setLastContent(lastText);
    },
    onCustomEvent({ event }) {
      switch (event.name) {
        case 'progress':
          if (!lastText && event.value?.text) setLastContent(event.value.text);
          break;
        case 'viewer_cmd':
          // keep it on the message so clicking the reply replays it
          addLastViewerCmd(event.value);
          executeViewerCommand(event.value);
          break;
        case 'ui_spec':
          // keep it on the message so clicking the reply replays it
          setLastMapSpec(event.value);
          void renderUISpec(event.value);
          break;
      }
    },
    onRunErrorEvent({ event }) {
      setLastContent(event.message);
    },
    // onRunFinishedEvent: same as legacy `done`, streaming is cleared in the finally
  };
}

/**
 * Hook for streaming responses from the GeoLang AI agent.
 *
 * Default (legacy) path speaks the hand-rolled backend protocol (POST
 * /agent/chat/stream, SSE lines of `data: {type, ...}`): `progress` | `text` |
 * `viewer_cmd` | `ui_spec` | `followups` | `done` | `error`. `viewer_cmd` events
 * drive the map via executeViewerCommand; `ui_spec` map results render via
 * renderUISpec.
 *
 * When `settings.useAgUiChannel` is on, the same handlers run against the AG-UI
 * client (POST /agent/chat/agui) instead. The flag is read per send, so it flips
 * at runtime without a rebuild.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const { addMessage, setLastContent, setLastMapSpec, addLastViewerCmd, setStreaming } = useChatStore();

  const send = useCallback(
    async (prompt: string) => {
      // Add user message
      addMessage({ role: 'user', content: prompt });

      // Start assistant placeholder
      addMessage({ role: 'assistant', content: '' });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // read per-send so the flag flips at runtime without a rebuild
      const useAgUi = useAppStore.getState().settings.useAgUiChannel;

      try {
        if (useAgUi) {
          // threadId stable per chat session, runId fresh per send. Only the latest
          // user prompt is sent; the agent's RunAgentInput carries it over the wire.
          const threadId = useChatStore.getState().activeSessionId ?? crypto.randomUUID();
          const messages: Message[] = [
            { id: crypto.randomUUID(), role: 'user', content: prompt },
          ];
          const agent = new HttpAgent({ url: '/agent/chat/agui', threadId, initialMessages: messages });
          await agent.runAgent(
            { runId: crypto.randomUUID(), abortController: controller },
            buildAgUiSubscriber({ setLastContent, setLastMapSpec, addLastViewerCmd }),
          );
          return;
        }

        const res = await fetch('/agent/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setLastContent(`[Error: ${res.status} ${res.statusText}]`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setLastContent('[Error: No response body]');
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let lastText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            let event: {
              type?: string;
              text?: string;
              cmd?: { action: string; params?: Record<string, unknown> };
              spec?: UiSpec;
            };
            try {
              event = JSON.parse(data);
            } catch {
              // Non-JSON line — treat as raw text
              lastText += data;
              setLastContent(lastText);
              continue;
            }
            switch (event.type) {
              case 'text':
                lastText = event.text ?? lastText;
                setLastContent(lastText);
                break;
              case 'progress':
                if (!lastText && event.text) setLastContent(`…${event.text}`);
                break;
              case 'viewer_cmd':
                if (event.cmd) {
                  // keep it on the message so clicking the reply replays it
                  addLastViewerCmd(event.cmd);
                  executeViewerCommand(event.cmd);
                }
                break;
              case 'ui_spec':
                if (event.spec) {
                  // keep it on the message so clicking the reply replays it
                  setLastMapSpec(event.spec);
                  void renderUISpec(event.spec);
                }
                break;
              case 'error':
                setLastContent(`Error: ${event.text ?? 'unknown'}`);
                break;
              // 'followups' / 'done' — nothing extra to render here
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setLastContent(`[Error: ${(err as Error).message}]`);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, setLastContent, setLastMapSpec, addLastViewerCmd, setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { send, abort };
}
