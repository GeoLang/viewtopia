/**
 * Execution plans from the agent's plan_workflow tool.
 *
 * The agent validates a geodukt TOML manifest and the run streams it as an AG-UI
 * custom `plan` event (payload built by geolang's src/agents/tools/_geodukt.py,
 * plan_payload). Nothing has run at that point. Approving posts the carried
 * manifest back verbatim twice: to the approval route, which is the only record
 * geolang has that a person agreed, and then to the run_workflow tool, which
 * refuses a manifest without one.
 */

import { apiHeaders, authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { useChatStore } from '../../store/chat';

export interface PlanStep {
  index: number;
  kind: 'source' | 'transform' | 'sink';
  name: string;
  operation?: string | null;
  input?: string | null;
  format?: string | null;
  path?: string | null;
  params?: Record<string, unknown>;
  /**
   * True when approving this step runs code the agent wrote rather than a
   * geodukt operation. Absent from a plan built before geolang emitted it.
   */
  runs_caller_code?: boolean;
}

export interface WorkflowPlan {
  title: string;
  project?: string;
  /** False when the plan was only parsed: that geodukt build has no /validate. */
  validated: boolean;
  steps: PlanStep[];
  /** Source paths the plan reads. */
  datasets?: string[];
  /** Sink paths the plan writes, none of which exist yet. */
  outputs?: string[];
  formats?: string[];
  /** The geodukt TOML the plan was validated from, and what run_workflow gets. */
  manifest: string;
}

/** One step as a sentence, matching the prose the agent read out to the user. */
export function stepText(step: PlanStep): string {
  const params = Object.entries(step.params ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  if (step.kind === 'source') {
    return `read ${step.name} from ${step.path} (${step.format})`;
  }
  if (step.kind === 'transform') {
    const text = `${step.operation} ${step.input} → ${step.name}`;
    return params ? `${text} (${params})` : text;
  }
  return `write ${step.input} to ${step.path} (${step.format})`;
}

/** One step's fate in a run. "unknown" is an older geodukt with no step status. */
export type StepOutcome = 'completed' | 'failed' | 'not_run' | 'unknown';

export interface RunStep {
  name: string;
  outcome: StepOutcome;
  feature_count?: number | null;
  /** Why this step failed, empty otherwise. */
  message?: string;
}

export interface RunOutput {
  name: string;
  path: string;
  format?: string | null;
  /** False when the sink never ran, so there is no file to download. */
  written: boolean;
}

/** geolang's run_payload (src/agents/tools/_geodukt.py), per-step run outcome. */
export interface WorkflowRunReport {
  id?: number | string | null;
  title?: string;
  status: 'completed' | 'failed';
  message?: string;
  steps: RunStep[];
  outputs: RunOutput[];
}

export interface WorkflowRun {
  ok: boolean;
  /** run_workflow's report: run id, per-step feature counts, files written. */
  text: string;
  /** The same run as structured data, when the tool emitted its marker. */
  report?: WorkflowRunReport;
}

const RUN_MARKER = '__RUN__:';

/**
 * Split run_workflow's result into the prose the user reads and the structured
 * report. The marker is one JSON line, the same seam the plan travels on, and it
 * must never reach the transcript.
 */
export function splitRunReport(result: string): { text: string; report?: WorkflowRunReport } {
  const at = result.indexOf(RUN_MARKER);
  if (at < 0) return { text: result.trim() };
  const [marker, ...rest] = result.slice(at + RUN_MARKER.length).split('\n');
  const text = (result.slice(0, at) + rest.join('\n')).trim();
  try {
    return { text, report: JSON.parse(marker.trim()) as WorkflowRunReport };
  } catch {
    return { text };
  }
}

/**
 * geolang serves outputs at /download/{filename} with no path segments, so only
 * the basename matches: "outputs/x.gpkg" downloads from "/agent/download/x.gpkg".
 */
export function outputDownloadUrl(path: string): string {
  return `/agent/download/${encodeURIComponent(path.split('/').pop() ?? path)}`;
}

/**
 * Download an output through fetch rather than a plain link: the route needs
 * the bearer header when the platform enforces auth, and an anchor cannot
 * carry one.
 */
export async function downloadOutput(path: string): Promise<boolean> {
  const res = await fetch(outputDownloadUrl(path), { headers: authHeaders() }).catch(() => null);
  if (res) noticeRefusal(res.status);
  if (!res?.ok) return false;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? path;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export interface WorkflowApproval {
  ok: boolean;
  /** Why it was refused, for the panel to show. Empty when it went through. */
  error: string;
}

/**
 * Record that the user approved this plan. run_workflow refuses a manifest with
 * no approval, so this posts first and the run is skipped when it fails.
 *
 * The manifest goes back exactly as the plan carried it: geolang keys the
 * approval to a digest of that text, and an edited one is refused.
 */
export async function approveWorkflow(manifest: string): Promise<WorkflowApproval> {
  let body: { approved?: boolean; message?: string } | null = null;
  try {
    const res = await fetch('/agent/workflow/approve', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ manifest_toml: manifest }),
    });
    if (!res.ok) {
      noticeRefusal(res.status);
      return { ok: false, error: `Could not approve the plan: HTTP ${res.status}` };
    }
    body = (await res.json()) as { approved?: boolean; message?: string };
  } catch (e) {
    return { ok: false, error: `Could not reach the approval: ${(e as Error).message}` };
  }
  if (body?.approved) return { ok: true, error: '' };
  return { ok: false, error: body?.message || 'The plan was not approved.' };
}

/**
 * Execute an approved manifest through geolang's run_workflow tool. The tool
 * reports its own failures in the result string over HTTP 200, so `ok` comes
 * from the text rather than the status.
 *
 * `notify` appends the report to the model's sibyl session: this runs outside
 * the model's turn, so without it a follow-up question would not know the
 * workflow ever ran. `thread_id` names which session that is, and geolang skips
 * the note without one. A session that has never been sent to has no backend id
 * yet, so there is nothing to append to either.
 */
export async function runWorkflow(manifest: string): Promise<WorkflowRun> {
  let body: { result?: string } | null = null;
  const threadId = useChatStore.getState().activeSession()?.backendId;
  try {
    const res = await fetch('/agent/tools/run_workflow', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        args: { manifest_toml: manifest },
        notify: true,
        ...(threadId ? { thread_id: threadId } : {}),
      }),
    });
    if (!res.ok) {
      noticeRefusal(res.status);
      return { ok: false, text: `run_workflow failed: HTTP ${res.status}` };
    }
    body = (await res.json()) as { result?: string };
  } catch (e) {
    return { ok: false, text: `run_workflow could not be reached: ${(e as Error).message}` };
  }
  const { text, report } = splitRunReport(body?.result ?? '');
  if (!text) return { ok: false, text: 'run_workflow returned nothing' };
  return { ok: report ? report.status === 'completed' : !/^(ERROR|❌)/.test(text), text, report };
}
