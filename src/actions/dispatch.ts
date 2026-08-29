/**
 * The one viewer command the model needs: run a named action from the
 * catalogue it was sent. A destructive action waits for a confirming reply in
 * the chat, and an action that answers a question sends its result back as the
 * next turn.
 */
import { MAXIMUM_FOLLOW_UPS, postSystemNotice, useChatStore } from '../store/chat';
import { useConfirmStore } from './confirm';
import { findAction, runAction, type ActionArguments, type ActionDefinition } from './registry';
import './index';

/** Replies that run the pending destructive action. Anything else cancels it. */
const CONFIRMING_REPLY = /^(yes|y|ok|confirm|do it)$/i;

/** The arguments as an object, or null when they cannot be read as one. */
function readArguments(args: unknown): ActionArguments | null {
  if (args === undefined || args === null) return {};
  if (typeof args === 'string') {
    if (args.trim() === '') return {};
    try {
      return readArguments(JSON.parse(args));
    } catch {
      return null;
    }
  }
  if (typeof args !== 'object' || Array.isArray(args)) return null;
  return args as ActionArguments;
}

/** A replay of an earlier result draws it again, says nothing about it, and takes the click as the confirmation. */
export interface RunOptions {
  announce?: boolean;
}

async function execute(definition: ActionDefinition, args: ActionArguments, announce: boolean): Promise<void> {
  let text: string;
  try {
    ({ text } = await runAction(definition.name, args));
  } catch (failure) {
    postSystemNotice(failure instanceof Error ? failure.message : String(failure));
    return;
  }
  if (!announce) return;
  postSystemNotice(text);
  if (!definition.reads) return;
  const chat = useChatStore.getState();
  if (chat.followUpCount >= MAXIMUM_FOLLOW_UPS) return;
  chat.queueFollowUp(`Result of ${definition.name}: ${text}`);
}

declare global {
  interface Window {
    // exposed for e2e so a test can run an action the way a tool result does
    __viewtopiaRunAction?: (params: Record<string, unknown>) => Promise<void>;
  }
}

/** viewer_cmd `run`: the params carry the action name and its arguments. */
export async function runViewerAction(
  params: Record<string, unknown>,
  { announce = true }: RunOptions = {},
): Promise<void> {
  const name = typeof params.name === 'string' ? params.name : String(params.name ?? '');
  const args = readArguments(params.args);
  if (args === null) {
    postSystemNotice(`${name}: its arguments did not read as an object.`);
    return;
  }
  const definition = findAction(name);
  if (!definition) {
    postSystemNotice(`There is no viewer action named ${name}.`);
    return;
  }
  if (definition.destructive && announce) {
    useConfirmStore.getState().setPending({ name, args });
    postSystemNotice(
      `${name}: ${definition.description.replace(/\.$/, '')}. Reply yes to run it, anything else cancels.`,
    );
    return;
  }
  await execute(definition, args, announce);
}

window.__viewtopiaRunAction = runViewerAction;

/**
 * Answer a pending confirmation with what the user typed. True when the reply
 * was the confirmation, so the chat sends nothing to the agent.
 */
export function interceptConfirmReply(text: string): boolean {
  const pending = useConfirmStore.getState().pending;
  if (!pending) return false;
  useConfirmStore.getState().setPending(null);
  if (!CONFIRMING_REPLY.test(text.trim())) {
    postSystemNotice(`Cancelled ${pending.name}.`);
    return false;
  }
  const definition = findAction(pending.name);
  if (!definition) {
    postSystemNotice(`There is no viewer action named ${pending.name}.`);
    return true;
  }
  void execute(definition, pending.args, true);
  return true;
}
