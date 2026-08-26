import { useEffect, useState } from 'react';
import { Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowsSplit2, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { createBranch, fetchBranches, fetchDatasets, type NamedRecord } from '../../lib/branchFeatures';
import {
  DEFAULT_BUFFER_METERS,
  MAX_BUFFER_METERS,
  MIN_BUFFER_METERS,
  coverageDifference,
  formatArea,
  formatDifference,
  recomputeCompare,
  startCompare,
  stopCompare,
  useScenarioCompareStore,
} from '../../features/scenario/compare';

const PANEL_COLOR = 'grape';

/** The branch whose head a side draws, when it names no moment. */
const LIVE = 'live';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(title: string, error: unknown): void {
  notifications.show({ title, message: message(error), color: 'red' });
}

/** A typed moment as RFC 3339, or null for live. Throws on something unreadable. */
function momentOf(typed: string, side: string): string | null {
  const trimmed = typed.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`the ${side} moment is not a date`);
  return parsed.toISOString();
}

export function ScenarioPanel({ onClose }: { onClose: () => void }) {
  const [datasets, setDatasets] = useState<NamedRecord[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [branches, setBranches] = useState<NamedRecord[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [distance, setDistance] = useState(DEFAULT_BUFFER_METERS);
  const [baseAt, setBaseAt] = useState('');
  const [scenarioAt, setScenarioAt] = useState('');
  const [busy, setBusy] = useState(false);
  const compared = useScenarioCompareStore((state) => state.compared);
  const coverage = useScenarioCompareStore((state) => state.coverage);

  useEffect(() => {
    fetchDatasets()
      .then(setDatasets)
      .catch((error) => fail('Datasets could not be listed', error));
  }, []);

  useEffect(() => {
    if (!datasetId) return;
    setBaseId(null);
    setScenarioId(null);
    fetchBranches(datasetId)
      .then((found) => {
        setBranches(found);
        setBaseId(found.find((branch) => branch.name === 'main')?.id ?? found[0]?.id ?? null);
      })
      .catch((error) => fail('Branches could not be listed', error));
  }, [datasetId]);

  async function compare() {
    if (!baseId || !scenarioId) return;
    setBusy(true);
    try {
      await startCompare({
        datasetId,
        baseBranchId: baseId,
        scenarioBranchId: scenarioId,
        baseAt: momentOf(baseAt, 'base'),
        scenarioAt: momentOf(scenarioAt, 'scenario'),
        distanceMeters: distance,
      });
    } catch (error) {
      fail('The comparison could not be drawn', error);
    } finally {
      setBusy(false);
    }
  }

  async function recompute() {
    setBusy(true);
    try {
      await recomputeCompare();
    } catch (error) {
      fail('The comparison could not be recomputed', error);
    } finally {
      setBusy(false);
    }
  }

  async function createScenario() {
    if (!datasetId || !baseId || !newName.trim()) return;
    setBusy(true);
    try {
      const branch = await createBranch(datasetId, newName.trim(), baseId);
      setBranches(await fetchBranches(datasetId));
      setScenarioId(branch.id);
      setNewName('');
    } catch (error) {
      fail('The scenario branch was not created', error);
    } finally {
      setBusy(false);
    }
  }

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));
  const drawnAtAMoment = baseAt.trim() !== '' || scenarioAt.trim() !== '';

  return (
    <PanelCard width={340}>
      <PanelHeader icon={<IconArrowsSplit2 size={16} />} title="Scenario" onClose={onClose} />

      <Stack gap="xs">
        <Select
          size="xs"
          label="Dataset"
          data-testid="scenario-dataset"
          placeholder={datasets.length ? 'Pick a dataset' : 'No datasets available'}
          data={datasets.map((dataset) => ({ value: dataset.id, label: dataset.name }))}
          value={datasetId}
          onChange={setDatasetId}
        />
        <Select
          size="xs"
          label="Base branch"
          data-testid="scenario-base"
          placeholder="Pick a branch"
          data={branchOptions}
          value={baseId}
          onChange={setBaseId}
          disabled={branches.length === 0}
        />
        <Select
          size="xs"
          label="Scenario branch"
          data-testid="scenario-branch"
          placeholder="Pick a branch"
          data={branchOptions}
          value={scenarioId}
          onChange={setScenarioId}
          disabled={branches.length === 0}
        />

        <Group gap={4} align="flex-end" wrap="nowrap">
          <TextInput
            size="xs"
            label="New scenario"
            data-testid="scenario-new-name"
            placeholder="name"
            style={{ flex: 1 }}
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
          />
          <Button
            size="xs"
            variant="light"
            color={PANEL_COLOR}
            data-testid="scenario-new"
            disabled={busy || !datasetId || !baseId || !newName.trim()}
            onClick={() => void createScenario()}
          >
            New scenario from base
          </Button>
        </Group>

        <NumberInput
          size="xs"
          label="Coverage distance (m)"
          data-testid="scenario-distance"
          min={MIN_BUFFER_METERS}
          max={MAX_BUFFER_METERS}
          value={distance}
          onChange={(value) => {
            const metres = typeof value === 'number' ? value : Number(value);
            if (Number.isFinite(metres)) setDistance(metres);
          }}
        />

        <Group gap={4} grow>
          <TextInput
            size="xs"
            label="Base as of"
            data-testid="scenario-base-at"
            placeholder={LIVE}
            value={baseAt}
            onChange={(event) => setBaseAt(event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            label="Scenario as of"
            data-testid="scenario-branch-at"
            placeholder={LIVE}
            value={scenarioAt}
            onChange={(event) => setScenarioAt(event.currentTarget.value)}
          />
        </Group>

        <Group gap={4} grow>
          <Button
            size="xs"
            variant="light"
            color={PANEL_COLOR}
            data-testid="scenario-compare"
            leftSection={<IconArrowsSplit2 size={12} />}
            disabled={busy || !baseId || !scenarioId}
            onClick={() => void compare()}
          >
            Compare
          </Button>
          {compared && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              data-testid="scenario-recompute"
              leftSection={<IconRefresh size={12} />}
              disabled={busy}
              onClick={() => void recompute()}
            >
              Recompute
            </Button>
          )}
        </Group>

        {coverage && (
          <>
            <Group gap="xs" grow align="flex-start">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Base (left)
                </Text>
                <Text size="xs" data-testid="scenario-base-coverage">
                  {coverage.base.featureCount} features, {formatArea(coverage.base.squareMeters)}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Scenario (right)
                </Text>
                <Text size="xs" data-testid="scenario-branch-coverage">
                  {coverage.scenario.featureCount} features,{' '}
                  {formatArea(coverage.scenario.squareMeters)}
                </Text>
              </Stack>
            </Group>
            <Text size="xs" c={PANEL_COLOR} data-testid="scenario-difference">
              {formatDifference(coverageDifference(coverage.base, coverage.scenario))}
            </Text>
            {drawnAtAMoment && (
              <Text size="xs" c="dimmed">
                Coverage counts each branch as it stands now, not the moment drawn.
              </Text>
            )}
          </>
        )}

        {compared && (
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            data-testid="scenario-stop"
            leftSection={<IconPlayerStop size={12} />}
            onClick={stopCompare}
          >
            Stop comparing
          </Button>
        )}
      </Stack>
    </PanelCard>
  );
}
