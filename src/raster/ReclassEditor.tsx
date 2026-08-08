/**
 * Class table for reclassify. terrano bins by [min, max), so the generator
 * pushes the top class past the data maximum to keep the highest cell classed
 * instead of dropping it to nodata.
 */
import { ActionIcon, Button, Group, NumberInput, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

export interface ReclassClass {
  /** row identity, so editing one row does not remount the others */
  id: string;
  min: number;
  max: number;
  value: number;
}

let nextId = 0;
const newId = () => String(++nextId);

export function equalIntervals(min: number, max: number, count: number): ReclassClass[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 1) return [];
  const step = (max - min) / count || 1;
  return Array.from({ length: count }, (_, i) => ({
    id: newId(),
    min: round(min + i * step),
    max: i === count - 1 ? round(max + step / 1000) : round(min + (i + 1) * step),
    value: i + 1,
  }));
}

function round(v: number): number {
  return Number(v.toFixed(4));
}

export function ReclassEditor({
  classes,
  onChange,
}: {
  classes: ReclassClass[];
  onChange: (classes: ReclassClass[]) => void;
}) {
  const update = (i: number, patch: Partial<ReclassClass>) =>
    onChange(classes.map((c, j) => (i === j ? { ...c, ...patch } : c)));

  return (
    <Stack gap={4}>
      <Group gap={8}>
        <Text size="xs" c="dimmed" w={62}>
          From
        </Text>
        <Text size="xs" c="dimmed" w={62}>
          To
        </Text>
        <Text size="xs" c="dimmed">
          Value
        </Text>
      </Group>
      {classes.map((c, i) => (
        <Group gap={8} key={c.id} wrap="nowrap">
          <NumberInput
            aria-label={`Class ${i + 1} from`}
            value={c.min}
            onChange={(v) => update(i, { min: Number(v) })}
            size="xs"
            w={62}
          />
          <NumberInput
            aria-label={`Class ${i + 1} to`}
            value={c.max}
            onChange={(v) => update(i, { max: Number(v) })}
            size="xs"
            w={62}
          />
          <NumberInput
            aria-label={`Class ${i + 1} value`}
            value={c.value}
            onChange={(v) => update(i, { value: Number(v) })}
            size="xs"
            w={62}
          />
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={`Remove class ${i + 1}`}
            onClick={() => onChange(classes.filter((_, j) => j !== i))}
          >
            <IconTrash size={13} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="xs"
        variant="subtle"
        leftSection={<IconPlus size={13} />}
        onClick={() =>
          onChange([...classes, { id: newId(), min: 0, max: 1, value: classes.length + 1 }])
        }
      >
        Add class
      </Button>
    </Stack>
  );
}
