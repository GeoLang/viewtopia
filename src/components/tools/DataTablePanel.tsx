import { useEffect, useMemo, useState } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Button,
  Table,
  ScrollArea,
  TextInput,
  Badge,
  Select,
} from '@mantine/core';
import {
  IconTable,
  IconX,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
} from '@tabler/icons-react';
import type { Entity } from 'cesium';
import {
  useEntityLayers,
  getEntityLayer,
  entityAttributes,
  flyToEntity,
} from '../../lib/entityLayers';
import {
  agentLayerId,
  attributeColumns,
  layerWithField,
  nextSort,
  sortRows,
  type SortState,
} from '../../features/attributes/attributes';
import {
  evaluateFields,
  joinLayers,
  type VirtualField,
} from '../../features/attributes/expressions';
import { useVirtualFieldStore } from '../../features/attributes/virtualFields';
import {
  FieldsSection,
  JoinSection,
  StatsSection,
} from '../../features/attributes/AttributeTools';
import { useAgentLayerStore } from '../../store/agentLayers';
import { useGeoJsonSources } from '../../lib/geojsonSources';

const MAX_ROWS = 500;
const NO_FIELDS: VirtualField[] = [];

type Tool = 'fields' | 'join' | 'stats';

interface FeatureRow {
  entity: Entity;
  attrs: Record<string, unknown>;
}

/** A right-hand column name that collides gets this in front of it. */
function joinPrefix(name: string): string {
  return `${name.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9]+/g, '_')}_`;
}

export function DataTablePanel({ onClose }: { onClose: () => void }) {
  const layers = useEntityLayers();
  const agentLayers = useAgentLayerStore((s) => s.layers);
  const sources = useGeoJsonSources();
  const allVirtualFields = useVirtualFieldStore((s) => s.fields);
  const addVirtualField = useVirtualFieldStore((s) => s.addField);
  const removeVirtualField = useVirtualFieldStore((s) => s.removeField);

  const [filter, setFilter] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [virtualValues, setVirtualValues] = useState<Record<string, unknown[]>>({});
  const [evalError, setEvalError] = useState<string | null>(null);

  const layerOptions = layers.map((l) => ({
    value: String(l.index),
    label: `${l.name} (${l.count})`,
  }));

  const layerKey = layers.find((l) => String(l.index) === selectedLayer)?.name ?? null;
  const layerId = layerKey ? agentLayerId(layerKey) : null;
  const storeLayer = layerId ? agentLayers.find((l) => l.id === layerId) : undefined;
  const virtualFields = (layerKey && allVirtualFields[layerKey]) || NO_FIELDS;
  const isVirtual = (column: string) => virtualFields.some((f) => f.name === column);

  const { columns, rows } = useMemo((): { columns: string[]; rows: FeatureRow[] } => {
    if (selectedLayer == null) return { columns: [], rows: [] };
    const ds = getEntityLayer(Number(selectedLayer));
    if (!ds) return { columns: [], rows: [] };
    const rows = ds.entities.values.map((entity) => ({
      entity,
      attrs: entityAttributes(entity),
    }));
    const columns = attributeColumns(rows.map((r) => r.attrs));
    // entities without a property bag still get a row via their name/id
    if (columns.length === 0 && rows.length > 0) {
      for (const row of rows) row.attrs = { name: row.entity.name ?? row.entity.id };
      columns.push('name');
    }
    return { columns, rows };
  }, [selectedLayer, layers]);

  useEffect(() => {
    if (virtualFields.length === 0) {
      setVirtualValues((current) => (Object.keys(current).length === 0 ? current : {}));
      setEvalError(null);
      return;
    }
    let cancelled = false;
    evaluateFields(
      rows.map((r) => r.attrs),
      virtualFields,
    )
      .then((values) => {
        if (cancelled) return;
        setVirtualValues(values);
        setEvalError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVirtualValues({});
        setEvalError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [rows, virtualFields]);

  const viewRows = useMemo(() => {
    if (virtualFields.length === 0) return rows;
    return rows.map((row, i) => ({
      ...row,
      attrs: {
        ...row.attrs,
        ...Object.fromEntries(virtualFields.map((f) => [f.name, virtualValues[f.name]?.[i]])),
      },
    }));
  }, [rows, virtualFields, virtualValues]);

  const allColumns = [...columns, ...virtualFields.map((f) => f.name)];

  const filteredRows = filter
    ? viewRows.filter((r) =>
        Object.values(r.attrs).some(
          (v) => v != null && String(v).toLowerCase().includes(filter.toLowerCase()),
        ),
      )
    : viewRows;

  // sorted before the cap, so the cap shows the true top rows
  const sortedRows = sortRows(filteredRows, (r) => r.attrs[sort?.column ?? ''], sort);
  const shownRows = sortedRows.slice(0, MAX_ROWS);

  const selectRow = (row: FeatureRow) => {
    setSelectedRowId(row.entity.id);
    flyToEntity(row.entity);
  };

  async function calculateField(field: VirtualField): Promise<string> {
    if (!storeLayer) throw new Error('this layer is not one the viewer owns');
    const values = await evaluateFields(
      storeLayer.geojson.features.map((f) => ({ ...f.properties })),
      [field],
    );
    useAgentLayerStore
      .getState()
      .addLayer(layerWithField(storeLayer, field.name, values[field.name]), false);
    return `${field.name} added to ${storeLayer.name} (${storeLayer.geojson.features.length} features)`;
  }

  async function join(sourceId: string, leftKey: string, rightKey: string): Promise<string> {
    const right = sources.find((s) => s.id === sourceId);
    if (!storeLayer || !right) throw new Error('pick a layer to join');
    const geojson = await joinLayers({
      left: storeLayer.geojson,
      right: right.geojson,
      leftKey,
      rightKey,
      prefix: joinPrefix(right.name),
    });
    const name = `${storeLayer.name} + ${right.name}`;
    useAgentLayerStore.getState().addLayer(
      { id: `join-${crypto.randomUUID()}`, name, color: storeLayer.color, geojson },
      false,
    );
    return `${name}: ${geojson.features.length} features`;
  }

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: tool ? '60vh' : '40vh',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconTable size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Attribute Table
          </Text>
          {rows.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {filteredRows.length}/{rows.length}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          {(['fields', 'join', 'stats'] as Tool[]).map((name) => (
            <Button
              key={name}
              size="xs"
              variant={tool === name ? 'filled' : 'light'}
              color="violet"
              disabled={selectedLayer == null}
              onClick={() => setTool(tool === name ? null : name)}
            >
              {name === 'fields' ? 'Fields' : name === 'join' ? 'Join' : 'Stats'}
            </Button>
          ))}
          <Select
            size="xs"
            w={200}
            placeholder={layers.length ? 'Select layer…' : 'No layers loaded'}
            data={layerOptions}
            value={selectedLayer}
            onChange={(v) => {
              setSelectedLayer(v);
              setSort(null);
            }}
          />
          <TextInput
            size="xs"
            w={160}
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={12} />}
          />
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>

      {tool === 'fields' && (
        <FieldsSection
          fields={virtualFields}
          onAddVirtual={(field) => layerKey && addVirtualField(layerKey, field)}
          onRemoveVirtual={(name) => layerKey && removeVirtualField(layerKey, name)}
          onCalculate={calculateField}
          calculable={!!storeLayer}
          evalError={evalError}
        />
      )}
      {tool === 'join' && (
        <JoinSection
          columns={columns}
          sources={sources.filter((s) => s.id !== storeLayer?.id)}
          onJoin={join}
          joinable={!!storeLayer}
        />
      )}
      {tool === 'stats' && (
        <StatsSection columns={allColumns} rows={filteredRows.map((r) => r.attrs)} />
      )}

      <ScrollArea flex={1}>
        {allColumns.length > 0 ? (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                {allColumns.map((col) => (
                  <Table.Th
                    key={col}
                    onClick={() => setSort(nextSort(sort, col))}
                    style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" c={isVirtual(col) ? 'violet.3' : 'white'}>
                        {col}
                      </Text>
                      {sort?.column === col &&
                        (sort.dir === 'asc' ? (
                          <IconSortAscending size={12} style={{ color: 'var(--mantine-color-violet-4)' }} />
                        ) : (
                          <IconSortDescending size={12} style={{ color: 'var(--mantine-color-violet-4)' }} />
                        ))}
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shownRows.map((row) => (
                <Table.Tr
                  key={row.entity.id}
                  onClick={() => selectRow(row)}
                  style={{
                    cursor: 'pointer',
                    background:
                      row.entity.id === selectedRowId ? 'rgba(167,139,250,0.2)' : undefined,
                  }}
                >
                  {allColumns.map((col) => (
                    <Table.Td key={col}>
                      <Text size="xs" c="gray.3">{String(row.attrs[col] ?? '')}</Text>
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xl">
            {layers.length === 0
              ? 'No layers loaded on the globe. Import data or ask the agent to add a layer.'
              : 'Select a layer to view its features. Click a row to fly to the feature.'}
          </Text>
        )}
      </ScrollArea>
    </Paper>
  );
}
