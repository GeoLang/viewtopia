/**
 * Telecom Plugin — Tower inventory and RF coverage simulation.
 */

import * as turf from '@turf/turf';
import { IconAntenna } from '@tabler/icons-react';
import { CoveragePanel, type TowerSite } from '../../components/tools/CoveragePanel';
import { viewshed } from '../../lib/terrainAnalysis';
import type { PluginDefinition, PluginContext } from '../sdk';

const COVERAGE_LAYER = 'telecom-coverage-simulated';
const VIEWSHED_LAYER = 'telecom-viewshed';

// 4/3-earth radio horizon: d(km) = 4.12 * sqrt(antenna height in m). Line of
// sight only, no terrain or clutter.
function horizonRadiusM(heightM: number): number {
  return 4120 * Math.sqrt(Math.max(heightM, 1));
}

// Footprint from the tower's own attributes: its coverage radius when the record
// carries one, otherwise the radio horizon for its height. Azimuth + beamwidth
// make it a sector, a missing beamwidth means omnidirectional.
function coverageFeature(tower: TowerSite): GeoJSON.Feature {
  const fromAttribute = tower.coverageRadius > 0;
  const radiusM = fromAttribute ? tower.coverageRadius : horizonRadiusM(tower.height);
  const center: [number, number] = [tower.lng, tower.lat];
  const sectored = tower.beamwidth > 0 && tower.beamwidth < 360;
  const shape = sectored
    ? turf.sector(
        center,
        radiusM / 1000,
        tower.azimuth - tower.beamwidth / 2,
        tower.azimuth + tower.beamwidth / 2,
      )
    : turf.circle(center, radiusM / 1000);

  return {
    ...shape,
    properties: {
      tower: tower.name,
      technology: tower.technology,
      simulated: true,
      radius_m: Math.round(radiusM),
      radius_source: fromAttribute ? 'coverage_radius_m attribute' : 'radio horizon from height_m',
      shape: sectored
        ? `${tower.beamwidth}° sector at ${tower.azimuth}° azimuth`
        : 'omnidirectional',
    },
  };
}

function TelecomPanel({ ctx }: { ctx: PluginContext }) {
  const color = ctx.settings.get<string>('coverageColor', '#4c6ef5');

  const showCoverage = (tower: TowerSite) => {
    if (!tower.lat && !tower.lng) return; // record has no position
    ctx.map.addGeoJsonLayer(COVERAGE_LAYER, coverageFeature(tower), {
      color,
      opacity: 0.25,
      lineWidth: 2,
    });
  };

  // Real terrain viewshed from tiletopia, same endpoint as the Viewshed tool.
  const showViewshed = async (lat: number, lng: number, height: number) => {
    const fc = await viewshed({
      observer: [lng, lat],
      height_m: height,
      radius_m: Math.round(horizonRadiusM(height)),
    });
    ctx.map.addGeoJsonLayer(VIEWSHED_LAYER, fc, { color, opacity: 0.35, lineWidth: 1 });
    ctx.map.flyTo(lng, lat, 13);
  };

  return (
    <CoveragePanel
      onClose={ctx.close}
      onFlyTo={(lat, lng) => ctx.map.flyTo(lng, lat)}
      onShowCoverage={showCoverage}
      onShowViewshed={showViewshed}
    />
  );
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
    { key: 'coverageColor', label: 'Coverage Overlay Color', type: 'color', defaultValue: '#4c6ef5' },
  ],
};

export default plugin;
