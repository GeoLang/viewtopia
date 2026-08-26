import {
  fetchBranches,
  fetchDatasets,
  type DatasetRecord,
  type NamedRecord,
} from '../lib/branchFeatures';
import { resolveOne } from './resolve';

/** The branch a dataset has when nobody names one. */
export const DEFAULT_BRANCH_NAME = 'main';

export async function resolveDataset(query: string): Promise<DatasetRecord> {
  return resolveOne('dataset', query, await fetchDatasets());
}

export async function resolveBranch(datasetId: string, query: string): Promise<NamedRecord> {
  return resolveOne('branch', query, await fetchBranches(datasetId));
}
