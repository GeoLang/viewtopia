/**
 * Agriculture Plugin — Field management, NDVI, soil moisture.
 */

import { IconPlant } from '@tabler/icons-react';
import { FieldPanel } from '../../components/tools/FieldPanel';
import type { PluginDefinition, PluginContext } from '../sdk';

function AgriculturePanel({ ctx }: { ctx: PluginContext }) {
  return <FieldPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onHighlightField={() => {}} onShowNdvi={() => {}} />;
}

const plugin: PluginDefinition = {
  id: 'agriculture',
  name: 'Agriculture',
  description: 'Crop zone management, NDVI analysis, and soil monitoring',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconPlant size={14} />,
  category: 'plugins',
  Panel: AgriculturePanel,
  settings: [
    { key: 'fieldBranchId', label: 'Fields Branch ID', type: 'text', description: 'Branch containing field polygon features' },
    { key: 'ndviColorRamp', label: 'NDVI Color Ramp', type: 'select', defaultValue: 'rdylgn', options: [{ value: 'rdylgn', label: 'Red-Yellow-Green' }, { value: 'viridis', label: 'Viridis' }, { value: 'spectral', label: 'Spectral' }] },
    { key: 'stressThreshold', label: 'Stress NDVI Threshold', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
  ],
};

export default plugin;
