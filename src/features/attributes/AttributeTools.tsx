/**
 * The attribute table's tool strips: calculated and virtual fields, and column
 * statistics with a chart. Each owns its own form state and reports back
 * through one callback, so the table itself stays a table.
 */
import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { ChartView } from '../dashboards/ChartWidget';
import type { ChartType } from '../dashboards/types';
import { buildChartData } from '../../components/tools/ChartsPanel';
import { columnStats } from './attributes';
import type { VirtualField } from './expressions';

const inputStyles = { input: { background: '#0d1117', borderColor: '#30363d' } };

const strip = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs an async action, showing what it reported or why it failed. */
function useAction(): {
  running: boolean;
  status: string | null;
  error: string | null;
  run: (action: () => Promise<string>) => Promise<void>;
} {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<string>) => {
    setRunning(true);
    setStatus(null);
    setError(null);
    try {
      setStatus(await action());
    } catch (err) {
      setError(message(err));
    } finally {
      setRunning(false);
    }
  };

  return { running, status, error, run };
}

export function FieldsSection({
  fields,
  onAddVirtual,
  onRemoveVirtual,
  onCalculate,
  calculable,
  evalError,
}: {
  fields: VirtualField[];
  onAddVirtual: (field: VirtualField) => void;
  onRemoveVirtual: (name: string) => void;
  onCalculate: (field: VirtualField) => Promise<string>;
  calculable: boolean;
  evalError: string | null;
}) {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const { running, status, error, run } = useAction();
  const field = { name: name.trim(), expression: expression.trim() };
  const ready = field.name !== '' && field.expression !== '';

  return (
    <Paper p="xs" mb="xs" style={strip}>
      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          w={140}
          label="Field name"
          placeholder="density"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          styles={inputStyles}
        />
        <TextInput
          size="xs"
          flex={1}
          miw={200}
          label="Expression (SQL)"
          placeholder="pop / area"
          value={expression}
          onChange={(e) => setExpression(e.currentTarget.value)}
          styles={inputStyles}
        />
        <Button
          size="xs"
          variant="light"
          color="violet"
          disabled={!ready}
          onClick={() => {
            onAddVirtual(field);
            setName('');
            setExpression('');
          }}
        >
          Add virtual field
        </Button>
        <Button
          size="xs"
          color="violet"
          disabled={!ready || !calculable}
          loading={running}
          onClick={() => run(() => onCalculate(field))}
        >
          Add to layer
        </Button>
      </Group>

      {!calculable && (
        <Text size="xs" c="dimmed" mt={4}>
          Only a layer the viewer owns can take a calculated field; this one can still
          carry virtual fields.
        </Text>
      )}

      {fields.length > 0 && (
        <Group gap="xs" mt="xs">
          {fields.map((f) => (
            <Badge
              key={f.name}
              size="sm"
              variant="light"
              color="violet"
              data-testid="attr-virtual-field"
              rightSection={
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  color="violet"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemoveVirtual(f.name)}
                >
                  <IconTrash size={10} />
                </ActionIcon>
              }
            >
              {f.name} = {f.expression}
            </Badge>
          ))}
        </Group>
      )}

      {status && (
        <Text size="xs" c="teal" mt={4} data-testid="attr-field-status">
          {status}
        </Text>
      )}
      {(error || evalError) && (
        <Text size="xs" c="red" mt={4} data-testid="attr-field-error">
          {error ?? evalError}
        </Text>
      )}
    </Paper>
  );
}

const show = (v: number | string | null): string => {
  if (v === null) return '—';
  return typeof v === 'number' ? String(Number(v.toPrecision(6))) : v;
};

export function StatsSection({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const [column, setColumn] = useState<string | null>(null);
  const [chartType, setChartType] = useState<string | null>('bar');

  const values = column ? rows.map((r) => r[column]) : [];
  const stats = columnStats(values);
  const chartData = column ? buildChartData(values) : [];

  return (
    <Paper p="xs" mb="xs" style={strip}>
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          w={180}
          label="Column"
          placeholder="pick a column"
          data={columns}
          value={column}
          onChange={setColumn}
          styles={inputStyles}
        />
        <Select
          size="xs"
          w={110}
          label="Chart"
          data={[
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
            { value: 'pie', label: 'Pie' },
          ]}
          value={chartType}
          onChange={setChartType}
          styles={inputStyles}
        />
        {column && (
          <Stack gap={2} flex={1} miw={220}>
            <Text size="xs" c="gray.3" data-testid="attr-stats">
              count {stats.count} · distinct {stats.distinct} · min {show(stats.min)} · max{' '}
              {show(stats.max)} · mean {show(stats.mean)} · median {show(stats.median)}
            </Text>
          </Stack>
        )}
      </Group>

      {chartData.length > 0 && (
        <Paper p="xs" mt="xs" style={{ background: '#21262d', borderRadius: 4, maxWidth: 360 }}>
          <ChartView chartType={(chartType as ChartType) ?? 'bar'} data={chartData} />
        </Paper>
      )}
    </Paper>
  );
}
