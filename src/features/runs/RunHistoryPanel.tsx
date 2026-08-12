/**
 * Every pipeline run the platform has kept, not only the ones this session
 * started. Opening a run shows the steps it executed with their outcomes and
 * the manifest it ran, which is the plan itself.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { IconHistory, IconRefresh } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { fetchRunHistory, type PipelineRun, type RunOutcome } from './runHistory';
import type { RunStep, StepOutcome } from '../workflow/plan';

const RUN_COLORS: Record<RunOutcome, string> = {
  completed: 'teal',
  failed: 'red',
  running: 'blue',
};

const STEP_COLORS: Record<StepOutcome, string> = {
  completed: 'teal',
  failed: 'red',
  not_run: 'gray',
  unknown: 'gray',
};

/** the count when the step ran, else how it ended */
function stepLabel(step: RunStep): string {
  if (step.outcome === 'completed') {
    return step.feature_count == null ? 'ok' : `${step.feature_count} features`;
  }
  if (step.outcome === 'failed') return 'failed';
  return step.outcome === 'not_run' ? 'not run' : '';
}

function RunRow({ run, open, onToggle }: { run: PipelineRun; open: boolean; onToggle: () => void }) {
  return (
    <Stack
      gap={4}
      p={6}
      data-testid={`run-${run.id}`}
      style={{
        background: 'var(--mantine-color-dark-6)',
        border: '1px solid var(--mantine-color-dark-5)',
        borderRadius: 6,
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Badge size="xs" variant="light" color={RUN_COLORS[run.outcome]}>
            {run.outcome}
          </Badge>
          <Text size="xs" c="gray.1" truncate>
            {run.project}
          </Text>
        </Group>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onToggle}>
          {open ? 'Hide plan' : 'Show plan'}
        </Button>
      </Group>

      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed">
          run {run.id}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          ran by {run.caller ?? 'nobody recorded'}
        </Text>
        <Badge size="xs" variant="outline" color="violet">
          {run.steps.length} steps
        </Badge>
      </Group>

      {run.message && (
        <Text size="xs" c="red.4" data-testid={`run-${run.id}-message`}>
          {run.message}
        </Text>
      )}

      {open && (
        <Stack gap={4}>
          <Stack gap={2}>
            {run.steps.map((step) => (
              <Group
                key={step.name}
                gap={6}
                wrap="nowrap"
                data-testid="run-step"
                title={[step.name, stepLabel(step), step.message].filter(Boolean).join(', ')}
              >
                <Text size="xs" c="gray.3" truncate style={{ flex: 1, minWidth: 0 }}>
                  {step.name}
                </Text>
                <Badge size="xs" variant="light" color={STEP_COLORS[step.outcome]}>
                  {stepLabel(step)}
                </Badge>
              </Group>
            ))}
          </Stack>
          <Code
            block
            data-testid={`run-${run.id}-manifest`}
            style={{ fontSize: 11, background: 'var(--mantine-color-dark-8)' }}
          >
            {run.manifest}
          </Code>
        </Stack>
      )}
    </Stack>
  );
}

export function RunHistoryPanel({ onClose }: { onClose: () => void }) {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await fetchRunHistory());
    } catch (err) {
      setRuns([]);
      setError(err instanceof Error ? err.message : 'Run history could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PanelCard width={380} testId="run-history-panel">
      <PanelHeader
        icon={<IconHistory size={16} />}
        title="Run History"
        onClose={onClose}
        badge={
          runs.length > 0 ? (
            <Badge size="xs" variant="light" color="violet">
              {runs.length}
            </Badge>
          ) : undefined
        }
        actions={
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => void load()}
            aria-label="Refresh run history"
          >
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      <Stack gap="xs">
        {loading && <Loader size="xs" data-testid="run-history-loading" />}

        {error && (
          <Alert color="red" variant="light" p="xs" data-testid="run-history-error">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {!loading && !error && runs.length === 0 && (
          <Text size="xs" c="dimmed" data-testid="run-history-empty">
            No pipeline has run yet. A plan you approve in the agent chat is recorded here.
          </Text>
        )}

        {runs.length > 0 && (
          <ScrollArea.Autosize mah={380}>
            <Stack gap={6}>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  open={openRun === run.id}
                  onToggle={() => setOpenRun((current) => (current === run.id ? null : run.id))}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {runs.length > 0 && (
          <Text size="xs" c="dimmed">
            Newest first. geodukt records no run time, only the order it ran them in.
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
