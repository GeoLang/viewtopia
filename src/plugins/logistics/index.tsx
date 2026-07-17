/**
 * Logistics Plugin — Fleet tracking and delivery optimization.
 */

import { IconTruck } from '@tabler/icons-react';
import { FleetPanel } from '../../components/tools/FleetPanel';
import { DeliveryPanel } from '../../components/tools/DeliveryPanel';
import { Tabs } from '@mantine/core';
import type { PluginDefinition, PluginContext } from '../sdk';

function LogisticsPanel({ ctx }: { ctx: PluginContext }) {
  return (
    <Tabs defaultValue="fleet">
      <Tabs.List>
        <Tabs.Tab value="fleet" size="xs">Fleet</Tabs.Tab>
        <Tabs.Tab value="delivery" size="xs">Delivery</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="fleet"><FleetPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onTrackVehicle={() => {}} /></Tabs.Panel>
      <Tabs.Panel value="delivery"><DeliveryPanel onClose={ctx.close} onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)} onShowRoute={() => {}} /></Tabs.Panel>
    </Tabs>
  );
}

const plugin: PluginDefinition = {
  id: 'logistics',
  name: 'Logistics',
  description: 'Real-time fleet tracking and multi-stop delivery route optimization',
  version: '1.0.0',
  author: 'TileTopia-HQ',
  icon: <IconTruck size={14} />,
  category: 'plugins',
  Panel: LogisticsPanel,
  settings: [
    { key: 'maxStops', label: 'Max Delivery Stops', type: 'number', defaultValue: 50, min: 2, max: 500 },
  ],
};

export default plugin;
