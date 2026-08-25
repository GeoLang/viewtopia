import { useCallback, useEffect, useState } from 'react';
import { Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowsSplit2, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import {
  branchFeatureCollection,
  branchIdOfLayer,
  branchLayerId,
  createBranch,
  fetchBranchCoverage,
  fetchBranchFeatures,
  fetchBranchFeaturesAt,
  fetchBranches,
  fetchDatasets,
  type BranchCoverage,
  type NamedRecord,
} from '../../lib/branchFeatures';
import { addGeoJsonLayer, removeGeoJsonLayer } from '../../lib/mapLayers';
import {
  useSplitViewStore,
  usePaneHiddenLayerIds,
  COMPARE_PANE,
  VIEWER_PANE,
  type Pane,
} from '../../store/splitView';

const PANEL_COLOR = 'grape';

/** How far a feature reaches, when the user has not said. */
const DEFAULT_BUFFER_METERS = 50;
/** ptolemy refuses a coverage distance outside this range. */
const MIN_BUFFER_METERS = 1;
const MAX_BUFFER_METERS = 100_000;

const SQUARE_METERS_PER_HECTARE = 10_000;
/** Above one hectare the square metres stop reading, so switch units. */
const HECTARE_THRESHOLD_SQUARE_METERS = 10_000;

const HECTARE_DECIMALS = 2;
const PERCENT_DECIMALS = 1;

const BASE_STYLE = { color: '#4dabf7', opacity: 0.4, lineWidth: 2, filled: true, stroked: true };
const SCENARIO_STYLE = { color: '#f06595', opacity: 0.4, lineWidth: 2, filled: true, stroked: true };

/** The branch whose head a side draws, when it names no moment. */
const LIVE = 'live';

/** An area a person can read: hectares once the square metres get long. */
export function formatArea(squareMeters: number): string {
  if (squareMeters >= HECTARE_THRESHOLD_SQUARE_METERS) {
    return `${(squareMeters / SQUARE_METERS_PER_HECTARE).toFixed(HECTARE_DECIMALS)} ha`;
  }
  return `${Math.round(squareMeters)} m²`;
}

export interface CoverageDifference {
  squareMeters: number;
  /** null when the base covers nothing, so there is no share of it to take */
  percent: number | null;
}

/** What the scenario adds to the base, as an area and as a share of it. */
export function coverageDifference(
  base: BranchCoverage,
  scenario: BranchCoverage,
): CoverageDifference {
  const squareMeters = scenario.squareMeters - base.squareMeters;
  return {
    squareMeters,
    percent: base.squareMeters > 0 ? (squareMeters / base.squareMeters) * 100 : null,
  };
}

export function formatDifference(difference: CoverageDifference): string {
  const sign = difference.squareMeters < 0 ? '-' : '+';
  const area = `${sign}${formatArea(Math.abs(difference.squareMeters))}`;
  if (difference.percent === null) return area;
  return `${area} (${sign}${Math.abs(difference.percent).toFixed(PERCENT_DECIMALS)}%)`;
}

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

/** The split view as it stood before a compare took it over. */
interface SplitViewBefore {
  active: boolean;
  comparePanes: Pane[];
  swipeAt: number | null;
}

// A comparison outlives the panel that started it: the layers and the hidden
// ids stay on the map after a close, and reopening has to be able to stop it.
let splitViewBefore: SplitViewBefore | null = null;

/** The branch pair a running comparison draws, read back off the panes. */
function comparedBranches(
  viewerHidden: string[],
  compareHidden: string[],
): { baseId: string; scenarioId: string } | null {
  const scenarioId = viewerHidden.map(branchIdOfLayer).find((id) => id !== null);
  const baseId = compareHidden.map(branchIdOfLayer).find((id) => id !== null);
  return baseId && scenarioId ? { baseId, scenarioId } : null;
}

interface Sides {
  base: BranchCoverage;
  scenario: BranchCoverage;
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
  const [sides, setSides] = useState<Sides | null>(null);
  const [busy, setBusy] = useState(false);
  const viewerHidden = usePaneHiddenLayerIds(VIEWER_PANE);
  const compareHidden = usePaneHiddenLayerIds(COMPARE_PANE);
  const compared = comparedBranches(viewerHidden, compareHidden);

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

  const drawBranch = useCallback(
    async (branchId: string, typed: string, side: string, style: typeof BASE_STYLE) => {
      const at = momentOf(typed, side);
      const features = at
        ? await fetchBranchFeaturesAt(branchId, at)
        : await fetchBranchFeatures(branchId);
      addGeoJsonLayer(branchLayerId(branchId), branchFeatureCollection(features), style);
    },
    [],
  );

  const load = useCallback(
    async (base: string, scenario: string) => {
      await drawBranch(base, baseAt, 'base', BASE_STYLE);
      await drawBranch(scenario, scenarioAt, 'scenario', SCENARIO_STYLE);
      const [baseCoverage, scenarioCoverage] = await Promise.all([
        fetchBranchCoverage(base, distance),
        fetchBranchCoverage(scenario, distance),
      ]);
      setSides({ base: baseCoverage, scenario: scenarioCoverage });
    },
    [baseAt, scenarioAt, distance, drawBranch],
  );

  async function compare() {
    if (!baseId || !scenarioId) return;
    if (baseId === scenarioId) {
      notifications.show({
        title: 'Pick two branches',
        message: 'A scenario is compared against a different branch.',
        color: 'red',
      });
      return;
    }
    // a second compare would otherwise leave the first pair's layers drawn and
    // its ids hidden, with no button left to clear them
    stop();
    setBusy(true);
    try {
      await load(baseId, scenarioId);
      const split = useSplitViewStore.getState();
      splitViewBefore ??= {
        active: split.active,
        comparePanes: split.comparePanes,
        swipeAt: split.swipeAt,
      };
      split.setLayout('twoAcross');
      split.setSwipeAt(null);
      split.setActive(true);
      split.hideLayerInPane(VIEWER_PANE, branchLayerId(scenarioId));
      split.hideLayerInPane(COMPARE_PANE, branchLayerId(baseId));
    } catch (error) {
      fail('The comparison could not be drawn', error);
    } finally {
      setBusy(false);
    }
  }

  async function recompute() {
    if (!compared) return;
    setBusy(true);
    try {
      await load(compared.baseId, compared.scenarioId);
    } catch (error) {
      fail('The comparison could not be recomputed', error);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    if (!compared) return;
    const split = useSplitViewStore.getState();
    split.showLayerInPane(VIEWER_PANE, branchLayerId(compared.scenarioId));
    split.showLayerInPane(COMPARE_PANE, branchLayerId(compared.baseId));
    removeGeoJsonLayer(branchLayerId(compared.baseId));
    removeGeoJsonLayer(branchLayerId(compared.scenarioId));
    if (splitViewBefore) {
      split.setComparePanes(splitViewBefore.comparePanes);
      split.setSwipeAt(splitViewBefore.swipeAt);
      split.setActive(splitViewBefore.active);
      splitViewBefore = null;
    }
    setSides(null);
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

        {sides && (
          <>
            <Group gap="xs" grow align="flex-start">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Base (left)
                </Text>
                <Text size="xs" data-testid="scenario-base-coverage">
                  {sides.base.featureCount} features, {formatArea(sides.base.squareMeters)}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Scenario (right)
                </Text>
                <Text size="xs" data-testid="scenario-branch-coverage">
                  {sides.scenario.featureCount} features, {formatArea(sides.scenario.squareMeters)}
                </Text>
              </Stack>
            </Group>
            <Text size="xs" c={PANEL_COLOR} data-testid="scenario-difference">
              {formatDifference(coverageDifference(sides.base, sides.scenario))}
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
            onClick={stop}
          >
            Stop comparing
          </Button>
        )}
      </Stack>
    </PanelCard>
  );
}
