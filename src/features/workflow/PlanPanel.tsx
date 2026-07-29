import { Badge, Button, Code, Collapse, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useChatStore } from '../../store/chat';
import { runWorkflow, stepText, type WorkflowPlan } from './plan';

const KIND_COLORS: Record<WorkflowPlan['steps'][number]['kind'], string> = {
  source: 'blue',
  transform: 'violet',
  sink: 'teal',
};

/**
 * A plan the agent proposed, in the chat transcript, with the approve action
 * that runs it. Approving posts the plan's own manifest, so what runs cannot
 * drift from what is on screen.
 */
export function PlanPanel({ messageId, plan }: { messageId: string; plan: WorkflowPlan }) {
  const { setPlanRun, addMessage } = useChatStore();
  // read the report back from the message, so approving re-renders this panel
  // whether or not the chat transcript around it re-rendered
  const planRun = useChatStore((s) =>
    s.sessions
      .find((sess) => sess.id === s.activeSessionId)
      ?.messages.find((msg) => msg.id === messageId)?.planRun,
  );
  const [showManifest, setShowManifest] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [running, setRunning] = useState(false);

  const failed = Boolean(planRun && /^(ERROR|❌)/.test(planRun));

  const approve = async () => {
    setRunning(true);
    const run = await runWorkflow(plan.manifest);
    setRunning(false);
    setPlanRun(messageId, run.text);
    // same transcript note viewer_cmd notices use, so the run is part of the
    // conversation rather than only a panel state
    addMessage({
      role: 'system',
      content: `${run.ok ? 'Ran' : 'Failed to run'} approved plan "${plan.title}".\n${run.text}`,
    });
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
      style={{ background: '#161b22', border: '1px solid #30363d', maxWidth: '85%' }}
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
              variant="light"
              color={planRun ? (failed ? 'red' : 'teal') : 'gray'}
              data-testid="plan-status"
            >
              {planRun ? (failed ? 'run failed' : 'ran') : 'not run yet'}
            </Badge>
          </Group>
        </Group>

        <Stack gap={2}>
          {plan.steps.map((step) => (
            <Group key={`${step.index}-${step.name}`} gap={6} wrap="nowrap" data-testid="plan-step">
              <Badge size="xs" variant="outline" color={KIND_COLORS[step.kind]}>
                {step.index}. {step.kind}
              </Badge>
              <Text size="xs" c="gray.3" style={{ wordBreak: 'break-word' }}>
                {stepText(step)}
              </Text>
            </Group>
          ))}
        </Stack>

        {plan.datasets?.length ? (
          <Text size="xs" c="dimmed">
            Reads: {plan.datasets.join(', ')}
          </Text>
        ) : null}
        {plan.outputs?.length ? (
          <Text size="xs" c="dimmed">
            Writes: {plan.outputs.join(', ')}
          </Text>
        ) : null}
        {plan.formats?.length ? (
          <Text size="xs" c="dimmed">
            Formats: {plan.formats.join(', ')}
          </Text>
        ) : null}

        <Group gap={6}>
          {!planRun && (
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
          <Code block data-testid="plan-manifest" style={{ fontSize: 11, background: '#0d1117' }}>
            {plan.manifest}
          </Code>
        </Collapse>

        {planRun && (
          <Text
            size="xs"
            c={failed ? 'red.4' : 'gray.3'}
            data-testid="plan-run-result"
            style={{
              background: failed ? '#2d1517' : '#0d1117',
              border: `1px solid ${failed ? '#f8514966' : '#30363d'}`,
              borderRadius: 6,
              padding: '6px 8px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {planRun}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
