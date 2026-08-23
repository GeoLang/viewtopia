import { Stack, Group, TextInput, ActionIcon, Button, Text } from '@mantine/core';
import { IconX, IconPlus } from '@tabler/icons-react';

export interface PropertyRow {
  key: string;
  value: string;
}

export function rowsFromProperties(properties: Record<string, unknown> | undefined): PropertyRow[] {
  return Object.entries(properties ?? {}).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
  }));
}

export function rowsToProperties(rows: PropertyRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

/**
 * Rows back into attributes, keeping the JSON type each key already had, so a
 * number edited in place does not come back a string. A new key, or text that
 * no longer reads as its old type, is a string.
 */
export function rowsToTypedProperties(
  rows: PropertyRow[],
  original: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = sameTypeAs(row.value, original[key]);
  }
  return out;
}

function sameTypeAs(text: string, previous: unknown): unknown {
  if (typeof previous === 'number') {
    const parsed = Number(text);
    return text.trim() !== '' && Number.isFinite(parsed) ? parsed : text;
  }
  if (typeof previous === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
  }
  return text;
}

interface PropertyRowsProps {
  rows: PropertyRow[];
  onChange: (rows: PropertyRow[]) => void;
  color: string;
}

/** Key/value editor for one feature's attributes. */
export function PropertyRows({ rows, onChange, color }: PropertyRowsProps) {
  return (
    <>
      {rows.length === 0 && (
        <Text size="xs" c="dimmed">
          No properties.
        </Text>
      )}
      <Stack gap={4}>
        {rows.map((row, idx) => (
          <Group key={idx} gap={4} wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="key"
              value={row.key}
              onChange={(e) => {
                const next = [...rows];
                next[idx] = { ...row, key: e.currentTarget.value };
                onChange(next);
              }}
              styles={{ input: { width: 110 } }}
            />
            <TextInput
              size="xs"
              placeholder="value"
              data-testid={`property-value-${row.key}`}
              value={row.value}
              onChange={(e) => {
                const next = [...rows];
                next[idx] = { ...row, value: e.currentTarget.value };
                onChange(next);
              }}
              style={{ flex: 1 }}
            />
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Remove property"
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
      <Button
        size="xs"
        variant="light"
        color={color}
        leftSection={<IconPlus size={12} />}
        onClick={() => onChange([...rows, { key: '', value: '' }])}
      >
        Add Property
      </Button>
    </>
  );
}
