/**
 * Agriculture Plugin — Field management, NDVI, soil moisture.
 */

import { useRef, useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { IconPlant } from '@tabler/icons-react';
import { FieldPanel, NDVI_COLOR } from '../../components/tools/FieldPanel';
import type { FieldSelection } from '../../components/tools/FieldPanel';
import { geometryCentroid } from '../../lib/wkb';
import type { PluginDefinition, PluginContext } from '../sdk';

const HIGHLIGHT_LAYER = 'field-highlight';

function AgriculturePanel({ ctx }: { ctx: PluginContext }) {
  const [note, setNote] = useState<string | null>(null);
  const ndviLayers = useRef<string[]>([]);

  const highlightField = (field: FieldSelection) => {
    if (!field.geometry) {
      ctx.map.removeLayer(HIGHLIGHT_LAYER);
      setNote(`${field.name}: no geometry in API`);
      return;
    }
    setNote(null);
    ctx.map.addGeoJsonLayer(
      HIGHLIGHT_LAYER,
      { type: 'Feature', geometry: field.geometry, properties: { field: field.name } },
      { color: '#40c057', opacity: 0.4, lineWidth: 2, filled: true, stroked: true },
    );
    const centre = geometryCentroid(field.geometry);
    if (centre) ctx.map.flyTo(centre[0], centre[1], 15);
  };

  const showNdvi = (fields: FieldSelection[]) => {
    for (const id of ndviLayers.current) ctx.map.removeLayer(id);
    ndviLayers.current = [];

    const scored = fields.flatMap((f) =>
      f.geometry && f.ndvi != null ? [{ ...f, geometry: f.geometry, ndvi: f.ndvi }] : [],
    );
    if (scored.length === 0) {
      setNote('no field has both geometry and an NDVI value in the API');
      return;
    }

    // a layer carries one colour, so the ramp becomes one layer per NDVI class
    const byColour = new Map<string, GeoJSON.Feature[]>();
    for (const f of scored) {
      const colour = NDVI_COLOR(f.ndvi);
      const features = byColour.get(colour) ?? [];
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { name: f.name, ndvi: f.ndvi },
      });
      byColour.set(colour, features);
    }

    for (const [colour, features] of byColour) {
      const id = `field-ndvi-${colour.slice(1)}`;
      ctx.map.addGeoJsonLayer(
        id,
        { type: 'FeatureCollection', features },
        { color: colour, opacity: 0.6, lineWidth: 1, filled: true, stroked: true },
      );
      ndviLayers.current.push(id);
    }

    const skipped = fields.length - scored.length;
    setNote(skipped > 0 ? `${skipped} of ${fields.length} fields lack geometry or NDVI in the API` : null);
  };

  return (
    <Stack gap={4}>
      <FieldPanel onClose={ctx.close} onHighlightField={highlightField} onShowNdvi={showNdvi} />
      {note && <Text size="xs" c="dimmed" ta="center">{note}</Text>}
    </Stack>
  );
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
