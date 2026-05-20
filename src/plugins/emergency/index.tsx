/**
 * Emergency Management Plugin — Incident dispatch and evacuation routing.
 */

import { IconAlertTriangle } from '@tabler/icons-react';
import { IncidentPanel } from '../../components/tools/IncidentPanel';
import type { PluginDefinition, PluginContext } from '../sdk';

function EmergencyPanel({ ctx }: { ctx: PluginContext }) {
  return <IncidentPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onShowEvacRoutes={() => {}} onShowAffectedArea={() => {}} />;
}

const plugin: PluginDefinition = {
  id: 'emergency',
  name: 'Emergency',
  description: 'Incident management, dispatch, and evacuation route planning',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconAlertTriangle size={14} />,
  category: 'plugins',
  Panel: EmergencyPanel,
  settings: [
    { key: 'incidentBranchId', label: 'Incidents Branch ID', type: 'text', description: 'Branch containing incident features' },
    { key: 'defaultEvacRadius', label: 'Default Evac Radius (m)', type: 'number', defaultValue: 1000, min: 100, max: 10000 },
    { key: 'sirenSound', label: 'Enable Alert Sound', type: 'boolean', defaultValue: false },
  ],
};

export default plugin;
