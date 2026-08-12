/**
 * Every pipeline run geodukt has executed, from its `GET /runs`, which nginx
 * proxies at `/api/pipeline/runs`. A run is recorded wherever it was started:
 * an agent session, the CLI, another user's browser. Which of them come back is
 * the server's decision, made from the bearer this sends: a caller sees its own
 * runs, an instance admin sees all of them.
 *
 * A record carries no time, only the id geodukt hands out in order, so the list
 * is ordered by that and says nothing about when a run happened.
 */

import { apiHeaders, noticeRefusal } from '../../lib/apiAuth';
import type { RunStep, StepOutcome } from '../workflow/plan';

const RUNS_URL = '/api/pipeline/runs';
const UNAUTHORIZED = 401;

/** How a run ended. geodukt's `Running` is a run still in flight. */
export type RunOutcome = 'completed' | 'failed' | 'running';

export interface PipelineRun {
  id: number;
  /** the manifest's project name */
  project: string;
  outcome: RunOutcome;
  /** why the run failed, absent otherwise */
  message?: string;
  /** token subject of whoever started it, null when geodukt ran unauthenticated */
  caller: string | null;
  steps: RunStep[];
  /** the manifest TOML as submitted, which is the plan that executed */
  manifest: string;
}

/** serde's external tagging: a unit variant is its name, `Failed` an object. */
type TaggedStatus = string | { Failed: string };

interface RunRecordJson {
  id: number;
  status: TaggedStatus;
  manifest_name: string;
  manifest: string;
  steps: { name: string; feature_count: number; status?: TaggedStatus }[];
  sub?: string;
}

const STEP_OUTCOMES: Record<string, StepOutcome> = {
  Completed: 'completed',
  NotRun: 'not_run',
};

function failureMessage(status: TaggedStatus | undefined): string | undefined {
  return typeof status === 'object' && status !== null ? status.Failed : undefined;
}

function stepOutcome(status: TaggedStatus | undefined): StepOutcome {
  if (failureMessage(status) !== undefined) return 'failed';
  return typeof status === 'string' ? (STEP_OUTCOMES[status] ?? 'unknown') : 'unknown';
}

function runOutcome(status: TaggedStatus): RunOutcome {
  if (failureMessage(status) !== undefined) return 'failed';
  return status === 'Completed' ? 'completed' : 'running';
}

function toRun(record: RunRecordJson): PipelineRun {
  return {
    id: record.id,
    project: record.manifest_name,
    outcome: runOutcome(record.status),
    message: failureMessage(record.status),
    caller: record.sub ?? null,
    steps: record.steps.map((step) => ({
      name: step.name,
      outcome: stepOutcome(step.status),
      feature_count: step.feature_count,
      message: failureMessage(step.status),
    })),
    manifest: record.manifest,
  };
}

/** Newest first, since a record's id is the order geodukt ran them in. */
export async function fetchRunHistory(): Promise<PipelineRun[]> {
  const response = await fetch(RUNS_URL, { headers: apiHeaders() }).catch(() => null);
  if (!response) throw new Error('The pipeline runner is unreachable.');
  noticeRefusal(response.status);
  if (response.status === UNAUTHORIZED) throw new Error('Sign in to read run history.');
  if (!response.ok) throw new Error(`The pipeline runner answered HTTP ${response.status}.`);
  const records = (await response.json()) as RunRecordJson[];
  return records.map(toRun).sort((a, b) => b.id - a.id);
}
