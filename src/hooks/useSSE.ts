import { useCallback, useRef } from 'react';
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import type { Message } from '@ag-ui/core';
import type { WorkflowPlan } from '../features/workflow/plan';
import { ensureBackendSession } from '../lib/agentSessions';
import { authHeaders } from '../lib/apiAuth';
import { useChatStore } from '../store/chat';
import { executeViewerCommand, type ViewerCommand } from '../viewer/commands';
import { renderUISpec, type UiSpec } from '../viewer/uiSpec';

/** Store setters the AG-UI subscriber writes through, so it can be tested in isolation. */
interface AgUiHandlers {
  setLastContent: (content: string) => void;
  setLastError: (error: string) => void;
  setLastMapSpec: (spec: UiSpec) => void;
  addLastViewerCmd: (cmd: ViewerCommand) => void;
  setLastPlan: (plan: WorkflowPlan) => void;
}

/**
 * Build the AgentSubscriber that maps AG-UI events onto the same store setters /
 * renderers the legacy SSE path uses. Exported so the mapping can be unit-tested
 * without a live agent.
 *
 * text delta → append to assistant message (setLastContent, like legacy `text`);
 * custom `progress` → show only while no assistant text has arrived yet;
 * custom `viewer_cmd` → executeViewerCommand + keep it on the message for replay;
 * custom `ui_spec` → keep the spec on the message + renderUISpec; custom `plan` →
 * keep it on the message, which renders the plan panel and its approve action;
 * run error → setLastContent (legacy `error`).
 */
export function buildAgUiSubscriber({ setLastContent, setLastError, setLastMapSpec, addLastViewerCmd, setLastPlan }: AgUiHandlers): AgentSubscriber {
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
        case 'plan':
          // nothing has run: the panel on the message owns the approve action
          setLastPlan(event.value);
          break;
      }
    },
    onRunErrorEvent({ event }) {
      // keep whatever streamed; the error renders as its own marked block
      setLastError(event.message);
    },
    // onRunFinishedEvent: same as legacy `done`, streaming is cleared in the finally
  };
}

/**
 * Hook for streaming responses from the GeoLang AI agent over the AG-UI
 * protocol (POST /agent/chat/agui via `@ag-ui/client` HttpAgent).
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const {
    addMessage,
    setLastContent,
    setLastError,
    setLastMapSpec,
    addLastViewerCmd,
    setLastPlan,
    setStreaming,
  } = useChatStore();

  const send = useCallback(
    async (prompt: string) => {
      // Add user message
      addMessage({ role: 'user', content: prompt });

      // Start assistant placeholder
      addMessage({ role: 'assistant', content: '' });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // threadId stable per chat session, runId fresh per send. Only the latest
        // user prompt is sent; the agent's RunAgentInput carries it over the wire.
        const threadId = useChatStore.getState().activeSessionId ?? crypto.randomUUID();
        // sibyl runs against whatever session it has active, so put it on this
        // one before the run, or the histories of every viewer session merge
        const session = useChatStore.getState().activeSession();
        if (session) {
          await ensureBackendSession(session.backendId, (backendId) =>
            useChatStore.getState().setBackendId(session.id, backendId),
          );
        }
        const messages: Message[] = [
          { id: crypto.randomUUID(), role: 'user', content: prompt },
        ];
        // the bearer goes with the run: geolang hands it to sibyl, which sends it
        // on every tool call, so the tools reach ptolemy and friends as this user
        const agent = new HttpAgent({
          url: '/agent/chat/agui',
          headers: authHeaders(),
          threadId,
          initialMessages: messages,
        });
        await agent.runAgent(
          { runId: crypto.randomUUID(), abortController: controller },
          buildAgUiSubscriber({
            setLastContent,
            setLastError,
            setLastMapSpec,
            addLastViewerCmd,
            setLastPlan,
          }),
        );
      } catch (err: unknown) {
        // a user stop surfaces as AbortError or a browser-internal message
        // like "BodyStreamBuffer was aborted"; neither is a failure worth a
        // red block, the partial reply just stays as it is
        const message = (err as Error).message ?? String(err);
        if ((err as Error).name !== 'AbortError' && !/abort/i.test(message)) {
          setLastError(message);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, setLastContent, setLastMapSpec, addLastViewerCmd, setLastPlan, setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { send, abort };
}
