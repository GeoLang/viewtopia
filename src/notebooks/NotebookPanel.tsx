/**
 * NotebookPanel — Jupyter-like notebook UI for ViewTopia workflows.
 */
import { useEffect, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  ActionIcon,
  TextInput,
  Text,
  Paper,
  Badge,
  Menu,
  Textarea,
  Code,
  ScrollArea,
  Tooltip,
  Divider,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconCode,
  IconMarkdown,
  IconMapPin,
  IconChevronDown,
  IconChevronRight,
  IconNotebook,
  IconFileExport,
  IconClearAll,
  IconDotsVertical,
  IconBrandPython,
  IconDatabase,
  IconMap2,
} from '@tabler/icons-react';
import { Table as MantineTable } from '@mantine/core';
import { useNotebookStore } from './notebookStore';
import type { NotebookCell, } from './types';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}

/** Render a single cell's outputs */
function CellOutputs({ outputs, onShowMap }: { outputs: NotebookCell['outputs']; onShowMap?: () => void | Promise<void> }) {
  const [showMapError, setShowMapError] = useState<string | null>(null);
  const [showingMap, setShowingMap] = useState(false);
  if (outputs.length === 0) return null;

  const handleShowMap = onShowMap
    ? async () => {
        setShowMapError(null);
        setShowingMap(true);
        try { await onShowMap(); } catch (err) {
          setShowMapError(err instanceof Error ? err.message : String(err));
        } finally { setShowingMap(false); }
      }
    : null;

  return (
    <Stack gap={4} mt={8}>
      {outputs.map((out, i) => {
        switch (out.type) {
          case 'text':
            return <Code key={i} block>{String(out.data)}</Code>;
          case 'json':
            return <Code key={i} block>{JSON.stringify(out.data, null, 2)}</Code>;
          case 'error':
            return <Code key={i} block color="red">{String(out.data)}</Code>;
          case 'image':
            return <img key={i} src={String(out.data)} alt="output" style={{ maxWidth: '100%', borderRadius: 4 }} />;
          case 'table': {
            const tbl = out.data as { columns: string[]; rows: Record<string, unknown>[]; rowCount: number };
            const preview = tbl.rows.slice(0, 100);
            return (
              <Stack key={i} gap={4}>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">{tbl.rowCount} row{tbl.rowCount === 1 ? '' : 's'}{tbl.rowCount > 100 ? ' (showing first 100)' : ''}</Text>
                  {handleShowMap && (
                    <Button size="compact-xs" variant="light" color="cyan" leftSection={<IconMap2 size={12} />} loading={showingMap} onClick={handleShowMap}>
                      Show on map
                    </Button>
                  )}
                </Group>
                {showMapError && <Code block color="red">{showMapError}</Code>}
                <ScrollArea.Autosize mah={320}>
                  <MantineTable striped withTableBorder withColumnBorders fz="xs">
                    <MantineTable.Thead>
                      <MantineTable.Tr>
                        {tbl.columns.map((c) => <MantineTable.Th key={c}>{c}</MantineTable.Th>)}
                      </MantineTable.Tr>
                    </MantineTable.Thead>
                    <MantineTable.Tbody>
                      {preview.map((row, r) => (
                        <MantineTable.Tr key={r}>
                          {tbl.columns.map((c) => (
                            <MantineTable.Td key={c}>{formatCell(row[c])}</MantineTable.Td>
                          ))}
                        </MantineTable.Tr>
                      ))}
                    </MantineTable.Tbody>
                  </MantineTable>
                </ScrollArea.Autosize>
              </Stack>
            );
          }
          case 'map-state':
            return <Code key={i} block>{JSON.stringify(out.data, null, 2)}</Code>;
          default:
            return <Code key={i} block>{String(out.data)}</Code>;
        }
      })}
    </Stack>
  );
}

/** Single cell component */
function Cell({
  cell,
  notebookId,
  index,
  totalCells,
}: {
  cell: NotebookCell;
  notebookId: string;
  index: number;
  totalCells: number;
}) {
  const { updateCellSource, removeCell, moveCell, runCell, toggleCellCollapse, runUpTo, showSqlAsLayer } = useNotebookStore();

  const handleShowOnMap = cell.type === 'sql'
    ? async () => {
        const layerId = `sql:${cell.id}`;
        await showSqlAsLayer(cell.source, layerId);
      }
    : undefined;

  const statusColor = {
    idle: 'gray',
    running: 'blue',
    success: 'green',
    error: 'red',
  }[cell.status];

  const typeIcon = {
    code: <IconCode size={14} />,
    markdown: <IconMarkdown size={14} />,
    'map-action': <IconMapPin size={14} />,
    python: <IconBrandPython size={14} />,
    sql: <IconDatabase size={14} />,
  }[cell.type];

  return (
    <Paper p="sm" withBorder style={{ borderLeft: `3px solid var(--mantine-color-${statusColor}-6)` }}>
      <Group justify="space-between" mb={cell.collapsed ? 0 : 8}>
        <Group gap={6}>
          <ActionIcon size="xs" variant="subtle" onClick={() => toggleCellCollapse(notebookId, cell.id)}>
            {cell.collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
          </ActionIcon>
          {typeIcon}
          <Badge size="xs" color={statusColor} variant="dot">
            {cell.type}{cell.executionCount > 0 ? ` [${cell.executionCount}]` : ''}
          </Badge>
        </Group>
        <Group gap={4}>
          {cell.type !== 'markdown' && (
            <>
              <Tooltip label="Run cell">
                <ActionIcon size="sm" variant="subtle" color="green" onClick={() => runCell(notebookId, cell.id)}>
                  <IconPlayerPlay size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Run up to here">
                <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => runUpTo(notebookId, cell.id)}>
                  <IconPlayerPlayFilled size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <ActionIcon size="sm" variant="subtle" onClick={() => moveCell(notebookId, cell.id, 'up')} disabled={index === 0}>
            <IconArrowUp size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" onClick={() => moveCell(notebookId, cell.id, 'down')} disabled={index === totalCells - 1}>
            <IconArrowDown size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeCell(notebookId, cell.id)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Group>

      {!cell.collapsed && (
        <>
          {cell.type === 'markdown' ? (
            <Textarea
              value={cell.source}
              onChange={(e) => updateCellSource(notebookId, cell.id, e.currentTarget.value)}
              minRows={2}
              autosize
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
          ) : (
            <Textarea
              value={cell.source}
              onChange={(e) => updateCellSource(notebookId, cell.id, e.currentTarget.value)}
              minRows={3}
              autosize
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.85rem', background: '#1c2128' } }}
            />
          )}
          <CellOutputs outputs={cell.outputs} onShowMap={handleShowOnMap} />
        </>
      )}
    </Paper>
  );
}

/** Main notebook panel */
export function NotebookPanel() {
  const {
    notebooks,
    activeNotebookId,
    loading,
    load,
    setActive,
    create,
    remove,
    rename,
    addCell,
    runAll,
    clearOutputs,
  } = useNotebookStore();
  const [newName, setNewName] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);

  async function handleCreate() {
    const name = newName.trim() || 'Untitled Notebook';
    const nb = await create(name);
    setActive(nb.id);
    setNewName('');
  }

  if (!activeNotebook) {
    // Notebook list view
    return (
      <Stack p="md">
        <Group justify="space-between">
          <Group gap={8}>
            <IconNotebook size={20} />
            <Text fw={600}>Notebooks</Text>
          </Group>
        </Group>

        <Group>
          <TextInput
            placeholder="New notebook name..."
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            size="xs"
            style={{ flex: 1 }}
          />
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={handleCreate}>
            Create
          </Button>
        </Group>

        <Divider />

        {loading && <Text size="sm" c="dimmed">Loading...</Text>}

        {notebooks.length === 0 && !loading && (
          <Text size="sm" c="dimmed">No notebooks yet. Create one to start recording workflows.</Text>
        )}

        <Stack gap={8}>
          {notebooks.map((nb) => (
            <Paper key={nb.id} p="sm" withBorder style={{ cursor: 'pointer' }} onClick={() => setActive(nb.id)}>
              <Group justify="space-between">
                <div>
                  <Text fw={500} size="sm">{nb.name}</Text>
                  <Text size="xs" c="dimmed">
                    {nb.cells.length} cells · {new Date(nb.updatedAt).toLocaleDateString()}
                  </Text>
                </div>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={(e) => { e.stopPropagation(); remove(nb.id); }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Stack>
    );
  }

  // Active notebook view
  return (
    <Stack p="md" gap="sm">
      <Group justify="space-between">
        <Group gap={8}>
          <ActionIcon size="sm" variant="subtle" onClick={() => setActive(null)}>
            ←
          </ActionIcon>
          <Text fw={600} size="sm">{activeNotebook.name}</Text>
          <Badge size="xs" variant="light">{activeNotebook.cells.length} cells</Badge>
        </Group>
        <Group gap={4}>
          <Tooltip label="Run all cells">
            <ActionIcon size="sm" variant="light" color="green" onClick={() => runAll(activeNotebook.id)}>
              <IconPlayerPlayFilled size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Clear all outputs">
            <ActionIcon size="sm" variant="light" color="gray" onClick={() => clearOutputs(activeNotebook.id)}>
              <IconClearAll size={14} />
            </ActionIcon>
          </Tooltip>
          <Menu shadow="md" width={160}>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle">
                <IconDotsVertical size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconFileExport size={14} />} disabled>
                Export as JSON
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => { remove(activeNotebook.id); setActive(null); }}>
                Delete Notebook
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="xs">
          {activeNotebook.cells.map((cell, i) => (
            <Cell key={cell.id} cell={cell} notebookId={activeNotebook.id} index={i} totalCells={activeNotebook.cells.length} />
          ))}
        </Stack>
      </ScrollArea>

      {/* Add cell buttons */}
      <Group justify="center" gap={8}>
        <Button size="xs" variant="light" leftSection={<IconCode size={14} />} onClick={() => addCell(activeNotebook.id, 'code')}>
          + Code
        </Button>
        <Button size="xs" variant="light" color="yellow" leftSection={<IconBrandPython size={14} />} onClick={() => addCell(activeNotebook.id, 'python')}>
          + Python
        </Button>
        <Button size="xs" variant="light" color="cyan" leftSection={<IconDatabase size={14} />} onClick={() => addCell(activeNotebook.id, 'sql')}>
          + SQL
        </Button>
        <Button size="xs" variant="light" leftSection={<IconMarkdown size={14} />} onClick={() => addCell(activeNotebook.id, 'markdown')}>
          + Markdown
        </Button>
        <Button size="xs" variant="light" leftSection={<IconMapPin size={14} />} onClick={() => addCell(activeNotebook.id, 'map-action')}>
          + Map Action
        </Button>
      </Group>
    </Stack>
  );
}
