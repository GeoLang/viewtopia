/**
 * Environmental Plugin — IoT sensor monitoring.
 */

import { IconDeviceDesktopAnalytics } from '@tabler/icons-react';
import { SensorPanel } from '../../components/tools/SensorPanel';
import type { PluginDefinition, PluginContext } from '../sdk';

function EnvironmentalPanel({ ctx }: { ctx: PluginContext }) {
  return <SensorPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} />;
}

const plugin: PluginDefinition = {
  id: 'environmental',
  name: 'Environmental',
  description: 'IoT sensor monitoring — water levels, air quality, soil moisture',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconDeviceDesktopAnalytics size={14} />,
  category: 'plugins',
  Panel: EnvironmentalPanel,
  settings: [
    { key: 'sensorBranchId', label: 'Sensors Branch ID', type: 'text', description: 'UUID of the branch containing sensor features' },
    { key: 'wsUrl', label: 'Sensor WebSocket URL', type: 'text', defaultValue: '/ws/sensors', description: 'Real-time readings endpoint' },
    { key: 'alertThreshold', label: 'Alert Threshold', type: 'number', defaultValue: 90, min: 0, max: 100, description: 'Trigger alert above this percentile' },
  ],
};

export default plugin;
