/**
 * Comparing one branch against another: a branch per split pane, with ptolemy's
 * buffered coverage on each side. The Scenario panel and the chat both drive
 * these functions and render what the store holds.
 */

import { create } from 'zustand';
import { fetchBranchCoverage, branchLayerId, type BranchCoverage } from '../../lib/branchFeatures';
import { removeGeoJsonLayer } from '../../lib/mapLayers';
import {
  COMPARE_PANE,
  VIEWER_PANE,
  useSplitViewStore,
  type Pane,
} from '../../store/splitView';
import { BRANCH_STYLE, SCENARIO_BRANCH_STYLE, drawBranchLayer } from './branchLayer';

/** How far a feature reaches, when nobody has said. */
export const DEFAULT_BUFFER_METERS = 50;
/** ptolemy refuses a coverage distance outside this range. */
export const MIN_BUFFER_METERS = 1;
export const MAX_BUFFER_METERS = 100_000;

const SQUARE_METERS_PER_HECTARE = 10_000;
/** Above one hectare the square metres stop reading, so switch units. */
const HECTARE_THRESHOLD_SQUARE_METERS = 10_000;

const HECTARE_DECIMALS = 2;
const PERCENT_DECIMALS = 1;

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

/** The pair a comparison draws, and the moments each side is drawn at. */
export interface ComparedBranches {
  /** the dataset both branches belong to, null when the caller did not say */
  datasetId: string | null;
  baseBranchId: string;
  scenarioBranchId: string;
  /** RFC 3339, or null for the branch head */
  baseAt: string | null;
  scenarioAt: string | null;
  distanceMeters: number;
}

export interface CoveragePair {
  base: BranchCoverage;
  scenario: BranchCoverage;
}

interface ScenarioCompareState {
  /** what is being compared, null when nothing is */
  compared: ComparedBranches | null;
  coverage: CoveragePair | null;
}

export const useScenarioCompareStore = create<ScenarioCompareState>(() => ({
  compared: null,
  coverage: null,
}));

/** The split view as it stood before a comparison took it over. */
interface SplitViewBefore {
  active: boolean;
  comparePanes: Pane[];
  swipeAt: number | null;
}

// a comparison outlives the panel that started it, so what to put back is held
// here rather than in a component
let splitViewBefore: SplitViewBefore | null = null;

async function drawPair(compared: ComparedBranches): Promise<CoveragePair> {
  await drawBranchLayer(compared.baseBranchId, compared.baseAt, BRANCH_STYLE);
  await drawBranchLayer(compared.scenarioBranchId, compared.scenarioAt, SCENARIO_BRANCH_STYLE);
  const [base, scenario] = await Promise.all([
    fetchBranchCoverage(compared.baseBranchId, compared.distanceMeters),
    fetchBranchCoverage(compared.scenarioBranchId, compared.distanceMeters),
  ]);
  return { base, scenario };
}

/**
 * Draw the two branches one per pane and read back what each covers. Any
 * comparison already running is stopped first, so only one pair is ever drawn.
 */
export async function startCompare(compared: ComparedBranches): Promise<CoveragePair> {
  if (compared.baseBranchId === compared.scenarioBranchId) {
    throw new Error('A scenario is compared against a different branch.');
  }
  stopCompare();
  const coverage = await drawPair(compared);

  const split = useSplitViewStore.getState();
  splitViewBefore ??= {
    active: split.active,
    comparePanes: split.comparePanes,
    swipeAt: split.swipeAt,
  };
  split.setLayout('twoAcross');
  split.setSwipeAt(null);
  split.setActive(true);
  split.hideLayerInPane(VIEWER_PANE, branchLayerId(compared.scenarioBranchId));
  split.hideLayerInPane(COMPARE_PANE, branchLayerId(compared.baseBranchId));

  useScenarioCompareStore.setState({ compared, coverage });
  return coverage;
}

/** Draw the running comparison again, picking up whatever the branches say now. */
export async function recomputeCompare(): Promise<CoveragePair> {
  const { compared } = useScenarioCompareStore.getState();
  if (!compared) throw new Error('No comparison is running.');
  const coverage = await drawPair(compared);
  useScenarioCompareStore.setState({ coverage });
  return coverage;
}

/** Take both branches off the map and give the split view back. */
export function stopCompare(): void {
  const { compared } = useScenarioCompareStore.getState();
  if (!compared) return;
  const split = useSplitViewStore.getState();
  split.showLayerInPane(VIEWER_PANE, branchLayerId(compared.scenarioBranchId));
  split.showLayerInPane(COMPARE_PANE, branchLayerId(compared.baseBranchId));
  removeGeoJsonLayer(branchLayerId(compared.baseBranchId));
  removeGeoJsonLayer(branchLayerId(compared.scenarioBranchId));
  if (splitViewBefore) {
    split.setComparePanes(splitViewBefore.comparePanes);
    split.setSwipeAt(splitViewBefore.swipeAt);
    split.setActive(splitViewBefore.active);
    splitViewBefore = null;
  }
  useScenarioCompareStore.setState({ compared: null, coverage: null });
}
