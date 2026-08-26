import {
  DEFAULT_BUFFER_METERS,
  MAX_BUFFER_METERS,
  MIN_BUFFER_METERS,
  coverageDifference,
  formatArea,
  formatDifference,
  startCompare,
  stopCompare,
  useScenarioCompareStore,
} from '../features/scenario/compare';
import { resolveBranch, resolveDataset } from './branchLookup';
import { ActionError, registerAction } from './registry';
import { isoMoment } from './resolve';
import type { BranchCoverage } from '../lib/branchFeatures';

function side(name: string, coverage: BranchCoverage): string {
  return `${name} covers ${formatArea(coverage.squareMeters)} over ${coverage.featureCount} features`;
}

registerAction({
  name: 'scenario.compare',
  description:
    'Compare two branches of a dataset side by side, with the ground each one covers.',
  parameters: {
    dataset: { type: 'string', description: 'Dataset id or name.', required: true },
    base_branch: { type: 'string', description: 'Branch id or name to compare against.', required: true },
    scenario_branch: { type: 'string', description: 'Branch id or name being proposed.', required: true },
    distance: {
      type: 'number',
      description: `How far a feature reaches, in metres. ${DEFAULT_BUFFER_METERS} by default.`,
    },
    base_at: { type: 'string', description: 'ISO 8601 moment to draw the base branch at.' },
    scenario_at: { type: 'string', description: 'ISO 8601 moment to draw the scenario branch at.' },
  },
  run: async (args) => {
    const dataset = await resolveDataset(args.dataset as string);
    const base = await resolveBranch(dataset.id, args.base_branch as string);
    const scenario = await resolveBranch(dataset.id, args.scenario_branch as string);
    if (base.id === scenario.id) {
      throw new ActionError(`${base.name} cannot be compared against itself`);
    }
    const distanceMeters = (args.distance as number) ?? DEFAULT_BUFFER_METERS;
    if (distanceMeters < MIN_BUFFER_METERS || distanceMeters > MAX_BUFFER_METERS) {
      throw new ActionError(
        `a coverage distance is between ${MIN_BUFFER_METERS} and ${MAX_BUFFER_METERS} metres, not ${distanceMeters}`,
      );
    }

    const coverage = await startCompare({
      datasetId: dataset.id,
      baseBranchId: base.id,
      scenarioBranchId: scenario.id,
      baseAt: args.base_at === undefined ? null : isoMoment('base_at', args.base_at as string),
      scenarioAt:
        args.scenario_at === undefined ? null : isoMoment('scenario_at', args.scenario_at as string),
      distanceMeters,
    });
    const difference = formatDifference(coverageDifference(coverage.base, coverage.scenario));
    return {
      text: `${side(base.name, coverage.base)}, ${side(scenario.name, coverage.scenario)}, a difference of ${difference}.`,
    };
  },
});

registerAction({
  name: 'scenario.stop',
  description: 'Stop the running comparison and take both branches off the map.',
  parameters: {},
  run: () => {
    if (!useScenarioCompareStore.getState().compared) {
      throw new ActionError('no comparison is running');
    }
    stopCompare();
    return { text: 'The comparison is off the map.' };
  },
});
