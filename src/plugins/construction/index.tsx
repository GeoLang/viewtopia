/**
 * Construction Plugin — Survey comparison, cut/fill, milestones.
 */

import { useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { IconCrane } from '@tabler/icons-react';
import { ConstructionPanel } from '../../components/tools/ConstructionPanel';
import type { SurveySelection } from '../../components/tools/ConstructionPanel';
import { geometryCentroid } from '../../lib/wkb';
import type { PluginDefinition, PluginContext } from '../sdk';

const SURVEY_LAYER = 'survey-extent';
const COMPARE_BASE_LAYER = 'survey-compare-base';
const COMPARE_TARGET_LAYER = 'survey-compare-target';

const BASE_COLOR = '#228be6';
const TARGET_COLOR = '#fa5252';

const EXTENT_STYLE = { opacity: 0.4, lineWidth: 2, filled: true, stroked: true };

function surveyFeature(name: string, geometry: GeoJSON.Geometry): GeoJSON.Feature {
  return { type: 'Feature', geometry, properties: { survey: name } };
}

function ConstructionPluginPanel({ ctx }: { ctx: PluginContext }) {
  const [note, setNote] = useState<string | null>(null);

  const flyToGeometry = (geometry: GeoJSON.Geometry) => {
    const centre = geometryCentroid(geometry);
    if (centre) ctx.map.flyTo(centre[0], centre[1], 15);
  };

  const loadSurvey = (survey: SurveySelection) => {
    const geometry = survey.geometry;
    if (!geometry) {
      ctx.map.removeLayer(SURVEY_LAYER);
      setNote(`${survey.name}: no geometry in API`);
      return;
    }
    setNote(null);
    ctx.map.addGeoJsonLayer(SURVEY_LAYER, surveyFeature(survey.name, geometry), {
      color: BASE_COLOR,
      ...EXTENT_STYLE,
    });
    flyToGeometry(geometry);
  };

  const compareSurveys = (base: SurveySelection, target: SurveySelection) => {
    const baseGeometry = base.geometry;
    const targetGeometry = target.geometry;
    if (!baseGeometry || !targetGeometry) {
      ctx.map.removeLayer(COMPARE_BASE_LAYER);
      ctx.map.removeLayer(COMPARE_TARGET_LAYER);
      const missing = [!baseGeometry && base.name, !targetGeometry && target.name].filter(Boolean);
      setNote(`no geometry in API for ${missing.join(' and ')}, cut/fill volumes only`);
      return;
    }
    setNote(null);
    ctx.map.addGeoJsonLayer(COMPARE_BASE_LAYER, surveyFeature(base.name, baseGeometry), {
      color: BASE_COLOR,
      ...EXTENT_STYLE,
    });
    ctx.map.addGeoJsonLayer(COMPARE_TARGET_LAYER, surveyFeature(target.name, targetGeometry), {
      color: TARGET_COLOR,
      ...EXTENT_STYLE,
    });
    flyToGeometry(baseGeometry);
  };

  return (
    <Stack gap={4}>
      <ConstructionPanel onClose={ctx.close} onLoadSurvey={loadSurvey} onCompareSurveys={compareSurveys} />
      {note && <Text size="xs" c="dimmed" ta="center">{note}</Text>}
    </Stack>
  );
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
