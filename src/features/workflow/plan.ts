/**
 * Execution plans from the agent's plan_workflow tool.
 *
 * The agent validates a geodukt TOML manifest and the run streams it as an AG-UI
 * custom `plan` event (payload built by geolang's src/agents/tools/_geodukt.py,
 * plan_payload). Nothing has run at that point: approving the plan posts the
 * carried manifest back verbatim to geolang's run_workflow tool, which is the
 * only thing that executes it.
 */

import { apiHeaders } from '../../lib/apiAuth';

export interface PlanStep {
  index: number;
  kind: 'source' | 'transform' | 'sink';
  name: string;
  operation?: string | null;
  input?: string | null;
  format?: string | null;
  path?: string | null;
  params?: Record<string, unknown>;
}

export interface WorkflowPlan {
  title: string;
  project?: string;
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

export interface WorkflowRun {
  ok: boolean;
  /** run_workflow's report: run id, per-step feature counts, files written. */
  text: string;
}

/**
 * Execute an approved manifest through geolang's run_workflow tool. The tool
 * reports its own failures in the result string over HTTP 200, so `ok` comes
 * from the text rather than the status.
 */
export async function runWorkflow(manifest: string): Promise<WorkflowRun> {
  let body: { result?: string } | null = null;
  try {
    const res = await fetch('/agent/tools/run_workflow', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ args: { manifest_toml: manifest } }),
    });
    if (!res.ok) return { ok: false, text: `run_workflow failed: HTTP ${res.status}` };
    body = (await res.json()) as { result?: string };
  } catch (e) {
    return { ok: false, text: `run_workflow could not be reached: ${(e as Error).message}` };
  }
  const text = (body?.result ?? '').trim();
  if (!text) return { ok: false, text: 'run_workflow returned nothing' };
  return { ok: !/^(ERROR|❌)/.test(text), text };
}
