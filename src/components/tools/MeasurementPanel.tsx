import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  Button,
  SegmentedControl,
} from '@mantine/core';
import { IconRuler, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useMeasureStore, type MeasureMode } from '../../store/measure';

export function MeasurementPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const mode = useMeasureStore((s) => s.mode);
  const pending = useMeasureStore((s) => s.pending);
  const liveDistance = useMeasureStore((s) => s.liveDistance);
  const results = useMeasureStore((s) => s.results);
  const setMode = useMeasureStore((s) => s.setMode);
  const finishMeasure = useMeasureStore((s) => s.finishMeasure);
  const cancelPending = useMeasureStore((s) => s.cancelPending);
  const clearAll = useMeasureStore((s) => s.clearAll);
  const removeResult = useMeasureStore((s) => s.removeResult);

  const activateMode = (m: MeasureMode) => {
    if (mode === m) {
      setMode(null);
    } else {
      setMode(m);
    }
  };

  const liveFmt =
    liveDistance >= 1000
      ? `${(liveDistance / 1000).toFixed(2)} km`
      : `${liveDistance.toFixed(1)} m`;

  return (
    <PanelCard width={280}>
      <PanelHeader
        icon={<IconRuler size={16} />}
        title="Measurement"
        onClose={onClose}
        badge={
          results.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {results.length}
            </Badge>
          )
        }
      />

      <SegmentedControl
        size="xs"
        fullWidth
        value={mode ?? ''}
        onChange={(v) => v && activateMode(v as MeasureMode)}
        data={[
          { value: 'distance', label: 'Distance' },
          { value: 'area', label: 'Area' },
        ]}
        mb="xs"
      />

      {mode && (
        <Text size="xs" c="green" ta="center" mb="xs">
          {mode === 'distance' && `Click points (${pending.length}). Double-click to finish.`}
          {mode === 'area' && `Click polygon vertices (${pending.length}). Double-click to finish.`}
        </Text>
      )}

      {pending.length >= 2 && (
        <Text size="xs" c="yellow" fw={600} ta="center" mb="xs">
          Running total: {liveFmt}
        </Text>
      )}

      {!mode && (
        <Text size="xs" c="dimmed" ta="center" mb="xs">
          Select Distance or Area, then click on the map.
        </Text>
      )}

      <Stack gap={4}>
        {results.map((r) => (
          <Group key={r.id} justify="space-between" p="xs"
            style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
          >
            <Group gap="xs">
              <Badge size="xs" variant="light" color="yellow">
                {r.mode}
              </Badge>
              <Text size="xs" c="white" fw={600}>
                {r.value.toFixed(2)} {r.unit}
              </Text>
            </Group>
            <ActionIcon size="xs" variant="subtle" color="red" onClick={() => removeResult(r.id)}>
              <IconTrash size={10} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>

      <Group mt="sm" gap="xs">
        {pending.length > 0 && (
          <Button size="xs" variant="subtle" color="gray" onClick={cancelPending} flex={1}>
            Cancel
          </Button>
        )}
        {pending.length >= 2 && (
          <Button size="xs" variant="filled" color="violet" onClick={finishMeasure} flex={1}>
            Finish
          </Button>
        )}
        <Button size="xs" variant="subtle" color="red" onClick={clearAll} disabled={results.length === 0}>
          Clear All
        </Button>
      </Group>
    </PanelCard>
  );
}
