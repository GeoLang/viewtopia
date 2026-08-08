/**
 * Zonal stats rows. Zone labels come back as numbers, so a polygon run names
 * its zones by the feature they were burnt from.
 */
import { Group, Paper, ScrollArea, Table, Text } from '@mantine/core';
import type { ZonalResult } from './types';

export function ZonalTable({
  rows,
  zoneLabel,
}: {
  rows: ZonalResult[];
  zoneLabel?: (zone: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <Paper p="xs" withBorder bg="dark.8">
        <Text size="xs" c="dimmed">
          No zone covered a cell with data.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper p="xs" withBorder bg="dark.8">
      <Group justify="space-between" mb={4}>
        <Text size="xs" fw={500} c="white">
          Zonal result
        </Text>
        <Text size="xs" c="dimmed">
          {rows.length} zone{rows.length === 1 ? '' : 's'}
        </Text>
      </Group>
      <ScrollArea.Autosize mah={220}>
        <Table fz="xs" verticalSpacing={2} horizontalSpacing={6} striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Zone</Table.Th>
              <Table.Th>Cells</Table.Th>
              <Table.Th>Mean</Table.Th>
              <Table.Th>Min</Table.Th>
              <Table.Th>Max</Table.Th>
              <Table.Th>σ</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.zoneId}>
                <Table.Td>{zoneLabel ? zoneLabel(Number(row.zoneId)) : row.zoneId}</Table.Td>
                <Table.Td>{row.count}</Table.Td>
                <Table.Td>{row.mean.toFixed(2)}</Table.Td>
                <Table.Td>{row.min.toFixed(2)}</Table.Td>
                <Table.Td>{row.max.toFixed(2)}</Table.Td>
                <Table.Td>{row.std.toFixed(2)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Paper>
  );
}
