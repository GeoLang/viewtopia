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
import { discoverBranch, listFields, fieldNdvi, FIELDS_DATASET } from '../../lib/verticals';
import type { NdviResponse } from '../../lib/verticals';
import { fetchBranchGeometry } from '../../lib/branchFeatures';

interface Field {
  id: string;
  name: string;
  crop: string;
  area: number; // hectares
  ndvi: number | null; // 0-1
  soilMoisture: number | null; // percentage
  plantingDate: string;
  harvestDate: string | null;
  status: 'planted' | 'growing' | 'harvest-ready' | 'harvested' | 'fallow';
  geometry: GeoJSON.Geometry | null;
}

/** What the map side needs to draw a field. */
export interface FieldSelection {
  id: string;
  name: string;
  ndvi: number | null;
  geometry: GeoJSON.Geometry | null;
}

interface FieldPanelProps {
  onHighlightField: (field: FieldSelection) => void;
  onShowNdvi: (fields: FieldSelection[]) => void;
  onClose: () => void;
}

export const NDVI_COLOR = (val: number) => {
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

export function FieldPanel({ onHighlightField, onShowNdvi, onClose }: FieldPanelProps) {
  const [fields, setFields] = useState<Field[]>([]);
  const [cropFilter, setCropFilter] = useState<string | null>('all');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [ndviDetail, setNdviDetail] = useState<(NdviResponse & { fieldName: string }) | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const branchId = await discoverBranch(FIELDS_DATASET);
      if (!branchId) {
        setError('No field dataset configured');
        setFields([]);
        return;
      }
      setBranchId(branchId);
      const [rows, geometry] = await Promise.all([
        listFields(branchId),
        fetchBranchGeometry(branchId),
      ]);
      setFields(
        rows.map((f) => {
          const p = f.properties;
          const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : null);
          const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
          return {
            id: f.id,
            name: f.name ?? f.id.slice(0, 8),
            crop: f.crop ?? 'unknown',
            area: f.area_ha ?? 0,
            ndvi: num('ndvi_mean'),
            soilMoisture: num('soil_moisture'),
            plantingDate: str('planting_date'),
            harvestDate: str('harvest_date') || null,
            status: (str('status') || 'planted') as Field['status'],
            geometry: geometry.get(f.id) ?? null,
          };
        }),
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const crops = [...new Set(fields.map((f) => f.crop))];
  const filtered = fields.filter((f) => cropFilter === 'all' || f.crop === cropFilter);
  const totalArea = filtered.reduce((s, f) => s + f.area, 0);
  const scored = filtered.filter((f): f is Field & { ndvi: number } => f.ndvi != null);
  const avgNdvi = scored.length > 0 ? scored.reduce((s, f) => s + f.ndvi, 0) / scored.length : null;
  const mappable = filtered.filter((f) => f.geometry != null).length;

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

        {error && <Text size="xs" c="dimmed" ta="center">{error}</Text>}
        {loaded && !error && fields.length === 0 && <Text size="xs" c="dimmed" ta="center">No fields found</Text>}

        {fields.length > 0 && (
          <>
            <Group gap="md">
              <Badge size="sm" variant="light">{totalArea.toFixed(0)} ha</Badge>
              <Group gap={4}>
                <IconSun size={12} />
                <Text size="xs">Avg NDVI: {avgNdvi != null ? avgNdvi.toFixed(2) : 'n/a'}</Text>
                {avgNdvi != null && <ColorSwatch color={NDVI_COLOR(avgNdvi)} size={12} />}
              </Group>
            </Group>

            <Select size="xs" value={cropFilter} onChange={setCropFilter}
              data={[{ value: 'all', label: 'All Crops' }, ...crops.map((c) => ({ value: c, label: c }))]} />

            <Button
              size="xs"
              variant="light"
              onClick={() => onShowNdvi(filtered)}
              disabled={scored.length === 0 || mappable === 0}
            >
              Color by NDVI
            </Button>
            {mappable === 0 && <Text size="xs" c="dimmed" ta="center">no geometry in API for these fields</Text>}
            {mappable > 0 && scored.length === 0 && <Text size="xs" c="dimmed" ta="center">no ndvi_mean in API for these fields</Text>}

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
                      onHighlightField(f);
                      if (branchId) {
                        fieldNdvi(branchId, f.id)
                          .then((d) => setNdviDetail({ ...d, fieldName: f.name }))
                          .catch(() => setNdviDetail(null));
                      }
                    }}>
                      <Table.Td><Text size="xs" fw={500}>{f.name}</Text></Table.Td>
                      <Table.Td><Text size="xs">{f.crop}</Text></Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {f.ndvi != null && <ColorSwatch color={NDVI_COLOR(f.ndvi)} size={10} />}
                          <Text size="xs">{f.ndvi != null ? f.ndvi.toFixed(2) : '—'}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs">{f.soilMoisture != null ? `${f.soilMoisture}%` : '—'}</Text></Table.Td>
                      <Table.Td><Badge size="xs" color={STATUS_COLORS[f.status]}>{f.status}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            {ndviDetail && (
              <>
                <Divider label={`NDVI: ${ndviDetail.fieldName}`} labelPosition="left" />
                <Group gap="md">
                  <Badge size="sm" color={ndviDetail.health_classification === 'healthy' ? 'green' : ndviDetail.health_classification === 'moderate_stress' ? 'yellow' : ndviDetail.health_classification === 'severe_stress' ? 'red' : 'gray'}>
                    {ndviDetail.health_classification.replace('_', ' ')}
                  </Badge>
                  <Text size="xs">
                    mean {ndviDetail.mean_ndvi?.toFixed(2) ?? 'n/a'}
                    {ndviDetail.min_ndvi != null && ndviDetail.max_ndvi != null &&
                      ` (${ndviDetail.min_ndvi.toFixed(2)} to ${ndviDetail.max_ndvi.toFixed(2)})`}
                  </Text>
                  {ndviDetail.timestamp && <Text size="xs" c="dimmed">{ndviDetail.timestamp}</Text>}
                </Group>
              </>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
