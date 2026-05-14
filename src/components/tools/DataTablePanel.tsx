import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Table,
  ScrollArea,
  TextInput,
  Badge,
  Select,
} from '@mantine/core';
import { IconTable, IconX, IconSearch } from '@tabler/icons-react';

interface DataRow {
  [key: string]: string | number | boolean | null;
}

export function DataTablePanel({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState('');
  const [columns] = useState<string[]>([]);
  const [rows] = useState<DataRow[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  const filteredRows = filter
    ? rows.filter((r) =>
        Object.values(r).some(
          (v) => v != null && String(v).toLowerCase().includes(filter.toLowerCase()),
        ),
      )
    : rows;

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
            w={160}
            placeholder="Select layer…"
            data={[]}
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
              {filteredRows.map((row, i) => (
                <Table.Tr key={i}>
                  {columns.map((col) => (
                    <Table.Td key={col}>
                      <Text size="xs" c="gray.3">{String(row[col] ?? '')}</Text>
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xl">
            No data loaded. Select a layer with attribute data to view its table.
          </Text>
        )}
      </ScrollArea>
    </Paper>
  );
}
