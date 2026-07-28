/**
 * sibyl's server-side chat sessions, reached through the /agent/ gateway.
 *
 * The viewer keeps its own sessions in the chat store, client-side. sibyl keeps
 * one active session per server and appends every run to it, so without pointing
 * it at the session on screen, one history grows across unrelated conversations
 * until the model's context overflows.
 *
 * None of this may block the viewer: every call that fails warns and returns, the
 * chat stays usable, and the next send re-attaches. The run itself surfaces the
 * errors that matter.
 */

import { apiHeaders } from './apiAuth';

const BASE = '/agent/sessions';

/** The session sibyl is on, as far as our own calls have taken it. */
let activeBackendId: string | null = null;

/** Drop that assumption, so the next send re-switches. Also used by tests. */
export function resetBackendSessionTracking() {
  activeBackendId = null;
}

async function call(path: string, method: string, body?: unknown): Promise<Response | null> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: apiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) console.warn(`[agent-session] ${method} ${path} failed: ${res?.status ?? 'no reply'}`);
  return res;
}

/**
 * Point sibyl at the session the viewer is showing, creating one on first use.
 * `attach` stores the new backend id on the viewer session that just got it.
 */
export async function ensureBackendSession(
  backendId: string | undefined,
  attach: (id: string) => void,
): Promise<void> {
  if (!backendId) {
    const res = await call('/new', 'POST');
    const created: { id?: string } | null = res?.ok ? await res.json().catch(() => null) : null;
    if (!created?.id) return;
    attach(created.id);
    // /new creates and activates in one call, so no switch is needed
    activeBackendId = created.id;
    return;
  }
  if (backendId === activeBackendId) return;
  const res = await call('/switch', 'POST', { session_id: backendId });
  if (res?.ok) activeBackendId = backendId;
}

/**
 * Drop the sibyl session behind a deleted viewer session. It answers 400 while
 * it is the active one, so move it onto the session the viewer switched to and
 * try once more. With nowhere to move it, leave it: the next send re-attaches.
 */
export async function deleteBackendSession(id: string, nextId?: string): Promise<void> {
  const res = await call(`/${id}`, 'DELETE');
  if (res?.status === 400 && nextId) {
    const switched = await call('/switch', 'POST', { session_id: nextId });
    if (switched?.ok) {
      activeBackendId = nextId;
      await call(`/${id}`, 'DELETE');
    }
  }
  if (activeBackendId === id) activeBackendId = null;
}

export async function renameBackendSession(id: string, name: string): Promise<void> {
  await call(`/${id}/rename`, 'PUT', { name });
}
