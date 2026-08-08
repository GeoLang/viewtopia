import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Textarea,
  TextInput,
  ScrollArea,
  Table,
  Select,
} from '@mantine/core';
import {
  IconDatabase,
  IconX,
  IconPlayerPlay,
  IconMap,
  IconDownload,
  IconLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { query, queryAsGeoJson, NoGeometryError } from '../../duckdb';
import { exportQuery, type ExportFormat } from '../../duckdb/exportFile';
import { attachCsvUrl, attachParquetUrl } from '../../duckdb/loaders';
import { useAgentLayerStore } from '../../store/agentLayers';

const MAX_ROWS = 500;
const HISTORY_KEY = 'viewtopia-sql-history';
const HISTORY_LIMIT = 25;

const SAMPLES = [
  { value: 'SHOW TABLES;', label: 'List tables' },
  {
    value: 'SELECT *, ST_AsGeoJSON(geom) AS geojson\nFROM places\nLIMIT 100;',
    label: 'Geometry of an imported table',
  },
  {
    value:
      "SELECT *\nFROM read_parquet('https://example.com/data.parquet')\nLIMIT 100;",
    label: 'Read a Parquet URL',
  },
];

interface Results {
  columns: string[];
  rows: Record<string, unknown>[];
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : 'query failed';
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'remote';
}

export function SqlWorkspacePanel({ onClose }: { onClose: () => void }) {
  const [sql, setSql] = useState('SHOW TABLES;');
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [url, setUrl] = useState('');
  const addLayer = useAgentLayerStore((s) => s.addLayer);

  const remember = (text: string) => {
    const next = [text, ...history.filter((h) => h !== text)].slice(0, HISTORY_LIMIT);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const run = async () => {
    const text = sql.trim();
    if (!text) return;
    setBusy(true);
    remember(text);
    try {
      const result = await query(text);
      setResults({ columns: result.columns, rows: result.rows });
      setError(null);
    } catch (err) {
      setResults(null);
      setError(reason(err));
    } finally {
      setBusy(false);
    }
  };

  const addToMap = async () => {
    const text = sql.trim();
    if (!text) return;
    try {
      const geojson = await queryAsGeoJson(text);
      addLayer({
        id: crypto.randomUUID(),
        name: text.slice(0, 40),
        color: '#38bdf8',
        geojson,
      });
      notifications.show({
        title: 'Added to map',
        message: `${geojson.features.length} features`,
        color: 'green',
      });
    } catch (err) {
      const noGeometry = err instanceof NoGeometryError;
      notifications.show({
        title: noGeometry ? 'Nothing to draw' : 'Query failed',
        message: reason(err),
        color: noGeometry ? 'yellow' : 'red',
      });
    }
  };

  const download = async (format: ExportFormat) => {
    const text = sql.trim();
    if (!text) return;
    try {
      const bytes = await exportQuery(text, format);
      // copied off the wasm heap, whose buffer Blob will not take
      const blob = new Blob([Uint8Array.from(bytes)], {
        type: format === 'csv' ? 'text/csv' : 'application/octet-stream',
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `query.${format}`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      notifications.show({ title: 'Export failed', message: reason(err), color: 'red' });
    }
  };

  const attach = async () => {
    const remote = url.trim();
    // signed URLs carry a query string, so the extension is on the path
    const path = remote.split(/[?#]/)[0];
    const parquet = path.toLowerCase().endsWith('.parquet');
    const csv = path.toLowerCase().endsWith('.csv');
    if (!parquet && !csv) {
      notifications.show({
        title: 'Cannot attach',
        message: 'the URL has to end in .parquet or .csv',
        color: 'red',
      });
      return;
    }
    const view = slug((path.split('/').pop() ?? '').replace(/\.[^.]+$/, ''));
    try {
      if (parquet) await attachParquetUrl(view, remote);
      else await attachCsvUrl(view, remote);
      notifications.show({
        title: 'Attached',
        message: `query it as ${view}`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({ title: 'Attach failed', message: reason(err), color: 'red' });
    }
  };

  const shown = results ? results.rows.slice(0, MAX_ROWS) : [];

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 460,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconDatabase size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            SQL
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Textarea
          autosize
          minRows={4}
          maxRows={10}
          value={sql}
          onChange={(e) => setSql(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void run();
            }
          }}
          data-testid="sql-editor"
          styles={{
            input: {
              background: '#0d1117',
              borderColor: '#30363d',
              fontFamily: 'monospace',
              fontSize: 12,
            },
          }}
        />

        <Group gap="xs">
          <Button
            size="xs"
            color="violet"
            loading={busy}
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => void run()}
            data-testid="sql-run"
          >
            Run
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconMap size={14} />}
            onClick={() => void addToMap()}
            data-testid="sql-add-map"
          >
            Add to map
          </Button>
          <Text size="xs" c="dimmed">
            Ctrl+Enter
          </Text>
        </Group>

        <Select
          size="xs"
          placeholder="Sample queries"
          data={SAMPLES}
          value={null}
          onChange={(value) => value && setSql(value)}
          data-testid="sql-samples"
        />

        {error && (
          <Text size="xs" c="red" data-testid="sql-error">
            {error}
          </Text>
        )}

        {results && (
          <>
            {results.rows.length > MAX_ROWS && (
              <Text size="xs" c="dimmed" data-testid="sql-cap">
                Showing {MAX_ROWS} of {results.rows.length} rows
              </Text>
            )}
            <ScrollArea.Autosize mah={220} type="auto">
              <Table striped highlightOnHover fz="xs" data-testid="sql-results">
                <Table.Thead>
                  <Table.Tr>
                    {results.columns.map((column) => (
                      <Table.Th key={column}>{column}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shown.map((row, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no id
                    <Table.Tr key={index}>
                      {results.columns.map((column) => (
                        <Table.Td key={column}>{cell(row[column])}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </>
        )}

        <Group gap="xs" grow>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            onClick={() => void download('csv')}
          >
            Export CSV
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            onClick={() => void download('parquet')}
          >
            Export GeoParquet
          </Button>
        </Group>

        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            label="Attach a .parquet or .csv URL"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            data-testid="sql-url"
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconLink size={14} />}
            onClick={() => void attach()}
          >
            Attach
          </Button>
        </Group>

        {history.length > 0 && (
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              History
            </Text>
            <ScrollArea.Autosize mah={100} type="auto">
              {history.map((entry) => (
                <Text
                  key={entry}
                  size="xs"
                  c="#8b949e"
                  data-testid="sql-history-item"
                  onClick={() => setSql(entry)}
                  style={{
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.replace(/\s+/g, ' ')}
                </Text>
              ))}
            </ScrollArea.Autosize>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
