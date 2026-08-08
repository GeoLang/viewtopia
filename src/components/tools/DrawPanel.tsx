import {
  Text,
  Stack,
  Group,
  Button,
  SegmentedControl,
  ColorSwatch,
  Slider,
  Badge,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore, type DrawMode } from '../../store/draw';

const COLORS = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#f87171'];

export function DrawPanel({ onClose }: { onClose: () => void }) {
  const mode = useDrawStore((s) => s.mode);
  const color = useDrawStore((s) => s.color);
  const lineWidth = useDrawStore((s) => s.lineWidth);
  const features = useDrawStore((s) => s.features);
  const pending = useDrawStore((s) => s.pending);
  const setMode = useDrawStore((s) => s.setMode);
  const setColor = useDrawStore((s) => s.setColor);
  const setLineWidth = useDrawStore((s) => s.setLineWidth);
  const clearAll = useDrawStore((s) => s.clearAll);
  const cancelPending = useDrawStore((s) => s.cancelPending);

  const activateMode = (m: DrawMode) => {
    if (mode === m) {
      setMode(null);
    } else {
      setMode(m);
    }
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconPencil size={16} />}
        title="Draw"
        onClose={onClose}
        badge={
          features.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {features.length}
            </Badge>
          )
        }
      />

      <Stack gap="xs">
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode === 'point' || mode === 'line' || mode === 'polygon' ? mode : ''}
          onChange={(v) => v && activateMode(v as DrawMode)}
          data={[
            { value: 'point', label: 'Point' },
            { value: 'line', label: 'Line' },
            { value: 'polygon', label: 'Polygon' },
          ]}
        />
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode === 'circle' || mode === 'rectangle' ? mode : ''}
          onChange={(v) => v && activateMode(v as DrawMode)}
          data={[
            { value: 'circle', label: 'Circle' },
            { value: 'rectangle', label: 'Rectangle' },
          ]}
        />

        <Text size="xs" c="dimmed">Color</Text>
        <Group gap={6}>
          {COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              size={20}
              onClick={() => setColor(c)}
              style={{
                cursor: 'pointer',
                border: c === color ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </Group>

        <Text size="xs" c="dimmed">Line Width: {lineWidth}px</Text>
        <Slider
          size="xs"
          min={1}
          max={8}
          value={lineWidth}
          onChange={setLineWidth}
          color="violet"
        />

        {mode && (
          <Text size="xs" c="green" ta="center" py="xs">
            {mode === 'point' && 'Click the map to place a point.'}
            {mode === 'line' && `Click to add vertices (${pending.length} pts). Double-click to finish.`}
            {mode === 'polygon' && `Click to add vertices (${pending.length} pts). Double-click to finish.`}
            {mode === 'circle' && (pending.length === 0 ? 'Click center, then click edge.' : 'Click to set radius.')}
            {mode === 'rectangle' && (pending.length === 0 ? 'Click first corner.' : 'Click opposite corner.')}
          </Text>
        )}

        {!mode && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            Select a shape above, then click on the map to draw.
          </Text>
        )}

        {pending.length > 0 && (
          <Button size="xs" variant="subtle" color="gray" onClick={cancelPending} fullWidth>
            Cancel Current
          </Button>
        )}

        <Button
          size="xs"
          variant="light"
          color="red"
          onClick={clearAll}
          disabled={features.length === 0}
          fullWidth
        >
          Clear All ({features.length})
        </Button>
      </Stack>
    </PanelCard>
  );
}
