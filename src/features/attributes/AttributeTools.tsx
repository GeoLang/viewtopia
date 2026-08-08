/**
 * The attribute table's tool strips: calculated and virtual fields, attribute
 * joins, and column statistics with a chart. Each owns its own form state and
 * reports back through one callback, so the table itself stays a table.
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
import { propertyKeys, type GeoJsonSource } from '../../lib/geojsonSources';
import { columnStats } from './attributes';
import type { VirtualField } from './expressions';

const strip = {
  background: 'var(--mantine-color-dark-8)',
  border: '1px solid var(--mantine-color-dark-5)',
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
        />
        <TextInput
          size="xs"
          flex={1}
          miw={200}
          label="Expression (SQL)"
          placeholder="pop / area"
          value={expression}
          onChange={(e) => setExpression(e.currentTarget.value)}
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

export function JoinSection({
  columns,
  sources,
  onJoin,
  joinable,
}: {
  columns: string[];
  sources: GeoJsonSource[];
  onJoin: (sourceId: string, leftKey: string, rightKey: string) => Promise<string>;
  joinable: boolean;
}) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [leftKey, setLeftKey] = useState<string | null>(null);
  const [rightKey, setRightKey] = useState<string | null>(null);
  const { running, status, error, run } = useAction();

  const source = sources.find((s) => s.id === sourceId);
  const ready = !!(source && leftKey && rightKey && joinable);

  return (
    <Paper p="xs" mb="xs" style={strip}>
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          w={180}
          label="Join layer"
          placeholder={sources.length ? 'pick a layer' : 'no other layer loaded'}
          data={sources.map((s) => ({ value: s.id, label: s.name }))}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            setRightKey(null);
          }}
        />
        <Select
          size="xs"
          w={150}
          label="Table field"
          placeholder="pick a field"
          data={columns}
          value={leftKey}
          onChange={setLeftKey}
        />
        <Select
          size="xs"
          w={150}
          label="Join field"
          placeholder="pick a field"
          data={propertyKeys(source)}
          value={rightKey}
          onChange={setRightKey}
        />
        <Button
          size="xs"
          color="violet"
          disabled={!ready}
          loading={running}
          onClick={() => run(() => onJoin(sourceId as string, leftKey as string, rightKey as string))}
        >
          Join layers
        </Button>
      </Group>

      <Text size="xs" c="dimmed" mt={4}>
        {joinable
          ? 'The match is a left join and lands as a new layer; the table layer is left alone.'
          : 'Only a layer the viewer owns can be joined.'}
      </Text>

      {status && (
        <Text size="xs" c="teal" mt={4} data-testid="attr-join-status">
          {status}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" mt={4} data-testid="attr-join-error">
          {error}
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
        <Paper p="xs" mt="xs" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4, maxWidth: 360 }}>
          <ChartView chartType={(chartType as ChartType) ?? 'bar'} data={chartData} />
        </Paper>
      )}
    </Paper>
  );
}
