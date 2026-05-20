/**
 * Construction Plugin — Survey comparison, cut/fill, milestones.
 */

import { IconCrane } from '@tabler/icons-react';
import { ConstructionPanel } from '../../components/tools/ConstructionPanel';
import type { PluginDefinition, PluginContext } from '../sdk';

function ConstructionPluginPanel({ ctx }: { ctx: PluginContext }) {
  return <ConstructionPanel onClose={ctx.close} onLoadSurvey={() => {}} onCompareSurveys={() => {}} />;
}

const plugin: PluginDefinition = {
  id: 'construction',
  name: 'Construction',
  description: 'Survey comparison, cut/fill volumes, and project milestones',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconCrane size={14} />,
  category: 'plugins',
  Panel: ConstructionPluginPanel,
  settings: [
    { key: 'surveyBranchId', label: 'Survey Branch ID', type: 'text', description: 'Branch with survey point cloud features' },
    { key: 'volumeUnit', label: 'Volume Unit', type: 'select', defaultValue: 'm3', options: [{ value: 'm3', label: 'Cubic Meters' }, { value: 'yd3', label: 'Cubic Yards' }] },
  ],
};

export default plugin;
