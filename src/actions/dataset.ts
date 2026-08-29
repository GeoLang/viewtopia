import { fetchBranches, fetchDatasets } from '../lib/branchFeatures';
import { drawBranchLayer } from '../features/scenario/branchLayer';
import { DEFAULT_BRANCH_NAME, resolveBranch, resolveDataset } from './branchLookup';
import { registerAction } from './registry';
import { isoMoment, labelOf } from './resolve';

registerAction({
  name: 'dataset.list',
  description: 'List the versioned datasets and the branches each one has.',
  parameters: {},
  reads: true,
  run: async () => {
    const datasets = await fetchDatasets();
    if (datasets.length === 0) return { text: 'There are no datasets.' };
    const lines = await Promise.all(
      datasets.map(async (dataset) => {
        const branches = await fetchBranches(dataset.id);
        return `${labelOf(dataset, datasets)}: ${branches.map((branch) => branch.name).join(', ')}`;
      }),
    );
    return { text: `${datasets.length} datasets. ${lines.join('. ')}.` };
  },
});

registerAction({
  name: 'dataset.draw_branch',
  description: 'Draw one branch of a dataset on the map, at its head or at a past moment.',
  parameters: {
    dataset: { type: 'string', description: 'Dataset id or name.', required: true },
    branch: { type: 'string', description: `Branch id or name, ${DEFAULT_BRANCH_NAME} by default.` },
    at: { type: 'string', description: 'ISO 8601 moment to draw the branch as it stood then.' },
  },
  run: async (args) => {
    const dataset = await resolveDataset(args.dataset as string);
    const branch = await resolveBranch(dataset.id, (args.branch as string) ?? DEFAULT_BRANCH_NAME);
    const at = args.at === undefined ? null : isoMoment('at', args.at as string);
    const drawn = await drawBranchLayer(branch.id, at);
    const when = at ? ` as it stood at ${at}` : '';
    return { text: `Drew ${drawn} features from ${branch.name} of ${dataset.name}${when}.` };
  },
});
