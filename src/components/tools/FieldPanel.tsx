import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  ScrollArea,
  Table,
  Select,
  ColorSwatch,
  Divider,
} from '@mantine/core';
import { IconX, IconPlant, IconDroplet, IconSun } from '@tabler/icons-react';

interface Field {
  id: string;
  name: string;
  crop: string;
  area: number; // hectares
  ndvi: number; // 0-1
  soilMoisture: number; // percentage
  plantingDate: string;
  harvestDate: string | null;
  status: 'planted' | 'growing' | 'harvest-ready' | 'harvested' | 'fallow';
  geometry: GeoJSON.Geometry | null;
}

interface FieldPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onHighlightField: (geometry: GeoJSON.Geometry | null) => void;
  onShowNdvi: (fieldId: string) => void;
  onClose: () => void;
}

const NDVI_COLOR = (val: number) => {
  if (val > 0.7) return '#2E7D32';
  if (val > 0.5) return '#66BB6A';
  if (val > 0.3) return '#FDD835';
  if (val > 0.1) return '#FF8F00';
  return '#D32F2F';
};

const STATUS_COLORS: Record<string, string> = {
  planted: 'blue',
  growing: 'green',
  'harvest-ready': 'orange',
  harvested: 'gray',
  fallow: 'dark',
};

export function FieldPanel({ onFlyTo, onHighlightField, onShowNdvi, onClose }: FieldPanelProps) {
  const [fields, setFields] = useState<Field[]>([]);
  const [cropFilter, setCropFilter] = useState<string | null>('all');
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agriculture/fields');
      const data = await res.json();
      setFields(data.fields || []);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  const crops = [...new Set(fields.map((f) => f.crop))];
  const filtered = fields.filter((f) => cropFilter === 'all' || f.crop === cropFilter);
  const totalArea = filtered.reduce((s, f) => s + f.area, 0);
  const avgNdvi = filtered.length > 0 ? filtered.reduce((s, f) => s + f.ndvi, 0) / filtered.length : 0;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconPlant size={18} />
            <Text fw={600} size="sm">Fields</Text>
          </Group>
          <ActionIcon size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoad} loading={loading}>Load Fields</Button>

        {fields.length > 0 && (
          <>
            <Group gap="md">
              <Badge size="sm" variant="light">{totalArea.toFixed(0)} ha</Badge>
              <Group gap={4}>
                <IconSun size={12} />
                <Text size="xs">Avg NDVI: {avgNdvi.toFixed(2)}</Text>
                <ColorSwatch color={NDVI_COLOR(avgNdvi)} size={12} />
              </Group>
            </Group>

            <Select size="xs" value={cropFilter} onChange={setCropFilter}
              data={[{ value: 'all', label: 'All Crops' }, ...crops.map((c) => ({ value: c, label: c }))]} />

            <Divider label="Field Health" labelPosition="left" />
            <ScrollArea h={300}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Field</Table.Th>
                    <Table.Th>Crop</Table.Th>
                    <Table.Th>NDVI</Table.Th>
                    <Table.Th>
                      <IconDroplet size={12} />
                    </Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filtered.map((f) => (
                    <Table.Tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => {
                      if (f.geometry) onHighlightField(f.geometry);
                      onShowNdvi(f.id);
                    }}>
                      <Table.Td><Text size="xs" fw={500}>{f.name}</Text></Table.Td>
                      <Table.Td><Text size="xs">{f.crop}</Text></Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <ColorSwatch color={NDVI_COLOR(f.ndvi)} size={10} />
                          <Text size="xs">{f.ndvi.toFixed(2)}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs">{f.soilMoisture}%</Text></Table.Td>
                      <Table.Td><Badge size="xs" color={STATUS_COLORS[f.status]}>{f.status}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}
      </Stack>
    </Paper>
  );
}
