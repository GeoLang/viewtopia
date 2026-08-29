import { useCallback, useRef } from 'react';
import { HttpAgent, type AgentSubscriber } from '@ag-ui/client';
import type { Message } from '@ag-ui/core';
import { actionCatalogue } from '../actions';
import { buildViewerSnapshot } from '../actions/snapshot';
import type { WorkflowPlan, WorkflowRunReport } from '../features/workflow/plan';
import { ensureBackendSession } from '../lib/agentSessions';
import { authHeaders } from '../lib/apiAuth';
import { isUnreachableStatus, unreachableMessage } from '../offline/backends';
import { useChatStore } from '../store/chat';
import { executeViewerCommand, type ViewerCommand } from '../viewer/commands';
import { renderUISpec, type UiSpec } from '../viewer/uiSpec';

/** a run whose request never got a reply, so there is no status to name */
const NO_RESPONSE = 0;

export const SIGN_IN_TO_CHAT = 'Sign in to chat with the agent.';
export const LOCAL_MODEL_DOWN =
  "The local model isn't running. Start it, or pick a cloud model in Settings.";

/**
 * The AG-UI client puts the HTTP status on the error it throws for a refused
 * run (`HTTP 503: ...`, with `status`), and lets fetch's own TypeError through
 * when nothing answered at all. Null for anything else, which keeps its text.
 */
export function unreachableRunError(failure: unknown): string | null {
  if (!(failure instanceof Error)) return null;
  const { status } = failure as Error & { status?: unknown };
  if (typeof status === 'number' && isUnreachableStatus(status)) {
    return unreachableMessage('geolang', status);
  }
  if (failure instanceof TypeError) return unreachableMessage('geolang', NO_RESPONSE);
  return null;
}

function statusOf(failure: unknown): number | undefined {
  if (!(failure instanceof Error)) return undefined;
  const { status } = failure as Error & { status?: unknown };
  return typeof status === 'number' ? status : undefined;
}

function isSignInFailure(failure: unknown, message: string): boolean {
  if (statusOf(failure) === 401) return true;
  return /HTTP 401\b/i.test(message) || /missing bearer token/i.test(message);
}

function isLocalConnectFailure(message: string): boolean {
  return (
    /connection refused/i.test(message) ||
    /tcp connect error/i.test(message) ||
    /host\.docker\.internal/i.test(message)
  );
}

/** Turn a refused run or a streamed model error into the sentence the chat shows. */
export function chatRunError(failure: unknown): string {
  const unreachable = unreachableRunError(failure);
  if (unreachable) return unreachable;
  const message = failure instanceof Error ? failure.message : String(failure);
  if (isSignInFailure(failure, message)) return SIGN_IN_TO_CHAT;
  if (isLocalConnectFailure(message)) return LOCAL_MODEL_DOWN;
  return message;
}

export function humanizeAgentMessage(message: string): string {
  if (isSignInFailure(undefined, message)) return SIGN_IN_TO_CHAT;
  if (isLocalConnectFailure(message)) return LOCAL_MODEL_DOWN;
  return message;
}

/** Store setters the AG-UI subscriber writes through, so it can be tested in isolation. */
interface AgUiHandlers {
  setLastContent: (content: string) => void;
  setLastError: (error: string) => void;
  setLastMapSpec: (spec: UiSpec) => void;
  addLastViewerCmd: (cmd: ViewerCommand) => void;
  setLastPlan: (plan: WorkflowPlan) => void;
  setLastPlanReport: (report: WorkflowRunReport) => void;
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
 * custom `run` → the per-step outcome of a run the model started, onto that same
 * panel; run error → setLastContent (legacy `error`).
 */
export function buildAgUiSubscriber({ setLastContent, setLastError, setLastMapSpec, addLastViewerCmd, setLastPlan, setLastPlanReport }: AgUiHandlers): AgentSubscriber {
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
        case 'run':
          // the model ran the plan itself, so the panel shows the outcome it
          // would otherwise only get from the approve button
          setLastPlanReport(event.value);
          break;
      }
    },
    onRunErrorEvent({ event }) {
      // keep whatever streamed; the error renders as its own marked block
      setLastError(humanizeAgentMessage(event.message));
    },
    // onRunFinishedEvent: same as legacy `done`, streaming is cleared in the finally
  };
}

export interface SendOptions {
  /** carries a read action's result back to the model, so it is not a prompt */
  followUp?: boolean;
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
    setLastPlanReport,
    setStreaming,
  } = useChatStore();

  const send = useCallback(
    async (prompt: string, options?: SendOptions) => {
      // a follow-up carries a read action's result, which the action already
      // posted as a system message, so the transcript needs nothing more
      if (options?.followUp) {
        useChatStore.getState().countFollowUp();
      } else {
        addMessage({ role: 'user', content: prompt });
        useChatStore.getState().startPromptTurn();
      }

      // Start assistant placeholder
      addMessage({ role: 'assistant', content: '' });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // threadId stable per chat session, runId fresh per send. Only the latest
        // user prompt is sent; the agent's RunAgentInput carries it over the wire.
        // sibyl routes the run by this thread id, so two tabs do not share
        // one server-side history. create the backend session first so the
        // id we send is the one sibyl already knows.
        const session = useChatStore.getState().activeSession();
        if (session) {
          await ensureBackendSession(session.backendId, (backendId) =>
            useChatStore.getState().setBackendId(session.id, backendId),
          );
        }
        const threadId =
          useChatStore.getState().activeSession()?.backendId ??
          useChatStore.getState().activeSessionId ??
          crypto.randomUUID();
        const messages: Message[] = [
          { id: crypto.randomUUID(), role: 'user', content: prompt },
        ];
        // the bearer goes with the run: geolang hands it to sibyl, which sends it
        // on every tool call, so the tools reach ptolemy and friends as this user
        // the run state is what the model knows about the viewer: what is on
        // screen now, and every action it may run through viewer_cmd
        const agent = new HttpAgent({
          url: '/agent/chat/agui',
          headers: authHeaders(),
          threadId,
          initialMessages: messages,
          initialState: { viewer: buildViewerSnapshot(), actions: actionCatalogue() },
        });
        await agent.runAgent(
          { runId: crypto.randomUUID(), abortController: controller },
          buildAgUiSubscriber({
            setLastContent,
            setLastError,
            setLastMapSpec,
            addLastViewerCmd,
            setLastPlan,
            setLastPlanReport,
          }),
        );
      } catch (err: unknown) {
        // a user stop surfaces as AbortError or a browser-internal message
        // like "BodyStreamBuffer was aborted"; neither is a failure worth a
        // red block, the partial reply just stays as it is
        const message = (err as Error).message ?? String(err);
        if ((err as Error).name !== 'AbortError' && !/abort/i.test(message)) {
          setLastError(chatRunError(err));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, setLastContent, setLastMapSpec, addLastViewerCmd, setLastPlan, setLastPlanReport, setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { send, abort };
}
