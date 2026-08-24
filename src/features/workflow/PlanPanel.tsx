import {
  Anchor,
  Badge,
  Button,
  Code,
  Collapse,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { useState } from 'react';
import { useChatStore } from '../../store/chat';
import {
  approveWorkflow,
  downloadOutput,
  runWorkflow,
  stepText,
  type RunStep,
  type StepOutcome,
  type WorkflowPlan,
} from './plan';

const KIND_COLORS: Record<WorkflowPlan['steps'][number]['kind'], string> = {
  source: 'blue',
  transform: 'violet',
  sink: 'teal',
};

const OUTCOME_COLORS: Record<StepOutcome, string> = {
  completed: 'teal',
  failed: 'red',
  not_run: 'gray',
  unknown: 'gray',
};

/** The short marker on a step row: the count when it ran, else its fate. */
function outcomeLabel(step: RunStep): string {
  if (step.outcome === 'completed') {
    return step.feature_count == null ? 'ok' : `${step.feature_count} features`;
  }
  if (step.outcome === 'failed') return 'failed';
  if (step.outcome === 'not_run') return 'not run';
  return '';
}

/**
 * A plan the agent proposed, in the chat transcript, with the approve action
 * that runs it. Approving records the approval and then runs, both with the
 * plan's own manifest, so what runs cannot drift from what is on screen. Once
 * it has run, each step row carries its outcome and the outputs become download
 * links.
 */
export function PlanPanel({ messageId, plan }: { messageId: string; plan: WorkflowPlan }) {
  const { setPlanRun, addMessage } = useChatStore();
  // read the report back from the message, so approving re-renders this panel
  // whether or not the chat transcript around it re-rendered
  const message = useChatStore((s) =>
    s.sessions
      .find((sess) => sess.id === s.activeSessionId)
      ?.messages.find((msg) => msg.id === messageId),
  );
  const planRun = message?.planRun;
  const report = message?.planReport;
  const [showManifest, setShowManifest] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [running, setRunning] = useState(false);
  const [approvalError, setApprovalError] = useState('');

  const ran = Boolean(planRun || report);
  const failed = report
    ? report.status === 'failed'
    : Boolean(planRun && /^(ERROR|❌)/.test(planRun));
  const written = report?.status === 'completed' ? report.outputs.filter((o) => o.written) : [];
  const runsAgentWrittenCode = plan.steps.some((s) => s.runs_caller_code);
  const manifestFile = `${(plan.project || plan.title || 'workflow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.toml`;

  const approve = async () => {
    setRunning(true);
    setApprovalError('');
    // geolang has no other record that a person agreed, so a refused approval
    // leaves the plan un-run and pressable again
    const approval = await approveWorkflow(plan.manifest);
    if (!approval.ok) {
      setApprovalError(approval.error);
      setRunning(false);
      return;
    }
    const run = await runWorkflow(plan.manifest);
    setRunning(false);
    setPlanRun(messageId, run.text, run.report);
    // same transcript note viewer_cmd notices use, so the run is part of the
    // conversation rather than only a panel state
    addMessage({
      role: 'system',
      content: `${run.ok ? 'Ran' : 'Failed to run'} approved plan "${plan.title}".\n${run.text}`,
    });
  };

  const downloadManifest = () => {
    const blob = new Blob([plan.manifest], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = manifestFile;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (dismissed) {
    return (
      <Group gap={6} mt={4} data-testid="plan-panel-dismissed">
        <Text size="xs" c="dimmed">
          Plan dismissed: {plan.title}
        </Text>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setDismissed(false)}>
          Show
        </Button>
      </Group>
    );
  }

  return (
    <Paper
      mt={4}
      p="xs"
      radius={8}
      data-testid="plan-panel"
      style={{ background: 'var(--mantine-color-dark-7)', border: '1px solid var(--mantine-color-dark-5)', maxWidth: '85%' }}
    >
      <Stack gap={6}>
        <Group gap={6} justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600} c="gray.1">
            {plan.title}
          </Text>
          <Group gap={4} wrap="nowrap">
            <Badge size="xs" variant="light" color="violet">
              {plan.steps.length} steps
            </Badge>
            <Badge
              size="xs"
              variant={plan.validated ? 'light' : 'filled'}
              color={plan.validated ? 'teal' : 'yellow'}
              data-testid="plan-validated"
            >
              {plan.validated ? 'validated' : 'not validated'}
            </Badge>
            <Badge
              size="xs"
              variant="light"
              color={ran ? (failed ? 'red' : 'teal') : 'gray'}
              data-testid="plan-status"
            >
              {ran ? (failed ? 'run failed' : 'ran') : 'not run yet'}
            </Badge>
          </Group>
        </Group>

        {!plan.validated && (
          <Text size="xs" c="yellow.4">
            geodukt did not check this plan, only its TOML was parsed.
          </Text>
        )}

        {runsAgentWrittenCode && (
          <Text size="xs" c="yellow.4" data-testid="plan-agent-code-notice">
            Approving this runs code the agent wrote itself, not only geodukt's built-in
            operations.
          </Text>
        )}

        <Stack gap={2}>
          {plan.steps.map((step) => {
            const outcome = report?.steps.find((s) => s.name === step.name);
            const label = outcome ? outcomeLabel(outcome) : '';
            // one line per row in a narrow rail, so the whole of it, failure
            // reason included, is the row's tooltip
            const full = [stepText(step), label, outcome?.message].filter(Boolean).join(', ');
            return (
              <Group
                key={`${step.index}-${step.name}`}
                gap={6}
                wrap="nowrap"
                data-testid="plan-step"
                title={full}
              >
                <Badge size="xs" variant="outline" color={KIND_COLORS[step.kind]}>
                  {step.index}. {step.kind}
                </Badge>
                {step.runs_caller_code && (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="yellow"
                    data-testid="plan-step-agent-code"
                  >
                    runs agent code
                  </Badge>
                )}
                <Text size="xs" c="gray.3" truncate style={{ flex: 1, minWidth: 0 }}>
                  {stepText(step)}
                </Text>
                {label && (
                  <Badge
                    size="xs"
                    variant="light"
                    color={outcome ? OUTCOME_COLORS[outcome.outcome] : 'gray'}
                    data-testid="plan-step-outcome"
                  >
                    {label}
                  </Badge>
                )}
              </Group>
            );
          })}
        </Stack>

        {plan.datasets?.length ? (
          <Text size="xs" c="dimmed">
            Reads: {plan.datasets.join(', ')}
          </Text>
        ) : null}
        {written.length ? (
          <Group gap={6} wrap="wrap" data-testid="plan-downloads">
            <Text size="xs" c="dimmed">
              Download:
            </Text>
            {written.map((out) => (
              <Anchor
                key={out.path}
                size="xs"
                component="button"
                type="button"
                onClick={() => void downloadOutput(out.path)}
                data-testid="plan-download"
              >
                {out.path.split('/').pop()}
              </Anchor>
            ))}
          </Group>
        ) : plan.outputs?.length ? (
          <Text size="xs" c="dimmed">
            Writes: {plan.outputs.join(', ')}
          </Text>
        ) : null}
        {plan.formats?.length ? (
          <Text size="xs" c="dimmed">
            Formats: {plan.formats.join(', ')}
          </Text>
        ) : null}
        {report ? (
          <Text size="xs" c="dimmed" data-testid="plan-engine">
            Run {report.id} executed by geodukt (geo/proj).
          </Text>
        ) : null}

        {approvalError && (
          <Text size="xs" c="red.4" data-testid="plan-approval-error">
            {approvalError}
          </Text>
        )}

        <Group gap={6}>
          {!ran && (
            <Button
              size="compact-xs"
              color="violet"
              onClick={approve}
              disabled={running}
              leftSection={running ? <Loader type="dots" size={10} color="white" /> : undefined}
              data-testid="plan-approve"
            >
              {running ? 'Running…' : 'Approve and run'}
            </Button>
          )}
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setDismissed(true)}
            data-testid="plan-dismiss"
          >
            Dismiss
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setShowManifest((v) => !v)}
            data-testid="plan-manifest-toggle"
          >
            {showManifest ? 'Hide manifest' : 'Show manifest'}
          </Button>
        </Group>

        <Collapse in={showManifest}>
          <Stack gap={4}>
            <Code block data-testid="plan-manifest" style={{ fontSize: 11, background: 'var(--mantine-color-dark-8)' }}>
              {plan.manifest}
            </Code>
            <Group gap={6} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={downloadManifest}
                data-testid="plan-manifest-download"
              >
                Download {manifestFile}
              </Button>
              <Code style={{ fontSize: 11, background: 'var(--mantine-color-dark-8)' }} data-testid="plan-rerun-command">
                geodukt run {manifestFile}
              </Code>
              <CopyButton value={`geodukt run ${manifestFile}`}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={copy}
                    data-testid="plan-rerun-copy"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
        </Collapse>

        {(planRun || report?.message) && (
          <Text
            size="xs"
            c={failed ? 'red.4' : 'gray.3'}
            data-testid="plan-run-result"
            style={{
              background: failed ? '#2d1517' : 'var(--mantine-color-dark-8)',
              border: `1px solid ${failed ? '#f8514966' : 'var(--mantine-color-dark-5)'}`,
              borderRadius: 6,
              padding: '6px 8px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {planRun || report?.message}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
