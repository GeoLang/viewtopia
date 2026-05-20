/**
 * Telecom Plugin — Tower inventory and RF coverage simulation.
 */

import { IconAntenna } from '@tabler/icons-react';
import { CoveragePanel } from '../../components/tools/CoveragePanel';
import type { PluginDefinition, PluginContext } from '../sdk';

function TelecomPanel({ ctx }: { ctx: PluginContext }) {
  return <CoveragePanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onShowCoverage={() => {}} onShowViewshed={() => {}} />;
}

const plugin: PluginDefinition = {
  id: 'telecom',
  name: 'Telecom',
  description: 'Cell tower inventory and RF coverage simulation',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconAntenna size={14} />,
  category: 'plugins',
  Panel: TelecomPanel,
  settings: [
    { key: 'towerBranchId', label: 'Towers Branch ID', type: 'text', description: 'Branch containing tower point features' },
    { key: 'defaultFrequency', label: 'Default Frequency (MHz)', type: 'number', defaultValue: 1800, min: 700, max: 6000 },
    { key: 'coverageColor', label: 'Coverage Overlay Color', type: 'color', defaultValue: '#4c6ef5' },
  ],
};

export default plugin;
