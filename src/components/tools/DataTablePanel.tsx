import { useMemo, useState } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Table,
  ScrollArea,
  TextInput,
  Badge,
  Select,
} from '@mantine/core';
import { IconTable, IconX, IconSearch } from '@tabler/icons-react';
import type { Entity } from 'cesium';
import {
  useEntityLayers,
  getEntityLayer,
  entityAttributes,
  flyToEntity,
} from '../../lib/entityLayers';

const MAX_ROWS = 500;

interface FeatureRow {
  entity: Entity;
  attrs: Record<string, unknown>;
}

export function DataTablePanel({ onClose }: { onClose: () => void }) {
  const layers = useEntityLayers();
  const [filter, setFilter] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const layerOptions = layers.map((l) => ({
    value: String(l.index),
    label: `${l.name} (${l.count})`,
  }));

  const { columns, rows } = useMemo((): { columns: string[]; rows: FeatureRow[] } => {
    if (selectedLayer == null) return { columns: [], rows: [] };
    const ds = getEntityLayer(Number(selectedLayer));
    if (!ds) return { columns: [], rows: [] };
    const entities = ds.entities.values.slice(0, MAX_ROWS);
    const rows = entities.map((entity) => ({ entity, attrs: entityAttributes(entity) }));
    const columns: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row.attrs)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    // entities without a property bag still get a row via their name/id
    if (columns.length === 0 && rows.length > 0) {
      for (const row of rows) row.attrs = { name: row.entity.name ?? row.entity.id };
      columns.push('name');
    }
    return { columns, rows };
  }, [selectedLayer, layers]);

  const filteredRows = filter
    ? rows.filter((r) =>
        Object.values(r.attrs).some(
          (v) => v != null && String(v).toLowerCase().includes(filter.toLowerCase()),
        ),
      )
    : rows;

  const selectRow = (row: FeatureRow) => {
    setSelectedRowId(row.entity.id);
    flyToEntity(row.entity);
  };

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
        maxHeight: '40vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconTable size={16} color="#a78bfa" />
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
          <Select
            size="xs"
            w={200}
            placeholder={layers.length ? 'Select layer…' : 'No layers loaded'}
            data={layerOptions}
            value={selectedLayer}
            onChange={setSelectedLayer}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <TextInput
            size="xs"
            w={160}
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={12} />}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <ScrollArea flex={1}>
        {columns.length > 0 ? (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                {columns.map((col) => (
                  <Table.Th key={col}>
                    <Text size="xs" c="white">{col}</Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRows.map((row) => (
                <Table.Tr
                  key={row.entity.id}
                  onClick={() => selectRow(row)}
                  style={{
                    cursor: 'pointer',
                    background:
                      row.entity.id === selectedRowId ? 'rgba(167,139,250,0.2)' : undefined,
                  }}
                >
                  {columns.map((col) => (
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
