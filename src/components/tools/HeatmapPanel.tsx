import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Slider,
  Select,
  Textarea,
  Button,
  ColorInput,
} from '@mantine/core';
import { IconFlame, IconX } from '@tabler/icons-react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { useDrawStore } from '../../store/draw';
import {
  collectPoints,
  pointsFromDraw,
  drawLayerOptions,
  showPanelDeckLayer,
  clearPanelDeckLayer,
  type PointRecord,
} from '../../lib/pointData';

const GROUP = 'panel-heatmap';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

export function HeatmapPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const [radius, setRadius] = useState(30);
  const [intensity, setIntensity] = useState(1);
  const [colorLow, setColorLow] = useState('#0000ff');
  const [colorHigh, setColorHigh] = useState('#ff0000');
  const [source, setSource] = useState<string>('pasted');
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const sourceData: { value: string; label: string }[] = [
    { value: 'pasted', label: 'Pasted GeoJSON' },
    ...drawLayerOptions(features),
  ];

  const gatherPoints = (): PointRecord[] => {
    if (source === 'pasted') {
      try {
        return collectPoints(JSON.parse(pasted));
      } catch {
        return [];
      }
    }
    return pointsFromDraw(source);
  };

  const addLayer = () => {
    const points = gatherPoints();
    if (points.length === 0) {
      setStatus('No points found in source');
      return;
    }
    showPanelDeckLayer(
      GROUP,
      new HeatmapLayer<PointRecord>({
        id: `panel-heatmap-${Date.now()}`,
        data: points,
        getPosition: (d) => d.position,
        getWeight: (d) => Number(d.properties.weight) || 1,
        radiusPixels: radius,
        intensity,
        colorRange: [hexToRgb(colorLow), hexToRgb(colorHigh)],
      }),
    );
    setStatus(`Heatmap added: ${points.length} points`);
  };

  const removeLayer = () => {
    clearPanelDeckLayer(GROUP);
    setStatus('Heatmap removed');
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconFlame size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Heatmap Layer
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Data Source"
          data={sourceData}
          value={source}
          onChange={(v) => v && setSource(v)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        {source === 'pasted' && (
          <Textarea
            size="xs"
            label="GeoJSON"
            placeholder='{"type":"FeatureCollection","features":[…]}'
            autosize
            minRows={2}
            maxRows={5}
            value={pasted}
            onChange={(e) => setPasted(e.currentTarget.value)}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
        )}

        <Text size="xs" c="dimmed">Radius: {radius}px</Text>
        <Slider size="xs" min={5} max={100} value={radius} onChange={setRadius} color="violet" />

        <Text size="xs" c="dimmed">Intensity: {intensity.toFixed(1)}</Text>
        <Slider size="xs" min={0.1} max={5} step={0.1} value={intensity} onChange={setIntensity} color="violet" />

        <Group gap="xs" grow>
          <ColorInput size="xs" label="Low" value={colorLow} onChange={setColorLow} />
          <ColorInput size="xs" label="High" value={colorHigh} onChange={setColorHigh} />
        </Group>

        <Group gap="xs" grow>
          <Button size="xs" color="violet" onClick={addLayer}>Add</Button>
          <Button size="xs" variant="subtle" color="gray" onClick={removeLayer}>Remove</Button>
        </Group>

        {status && (
          <Text size="xs" c="green" data-testid="heatmap-status">{status}</Text>
        )}
      </Stack>
    </Paper>
  );
}
