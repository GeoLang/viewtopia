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
  TextInput,
  NumberInput,
  Select,
  Divider,
} from '@mantine/core';
import {
  IconX,
  IconUrgent,
  IconAlertTriangle,
  IconUsers,
  IconPlus,
} from '@tabler/icons-react';
import {
  discoverBranch,
  listIncidents,
  createIncident,
  INCIDENTS_DATASET,
  missingDatasetMessage,
} from '../../lib/verticals';

interface Incident {
  id: string;
  type: string;
  description: string;
  severity: string;
  status: string;
  lat: number | null;
  lng: number | null;
  reportedAt: string;
  assignedUnits: string[];
  affectedPopulation: number;
  properties: Record<string, unknown>;
}

/** What the map side needs to plot an incident. */
export interface IncidentSelection {
  id: string;
  type: string;
  lat: number | null;
  lng: number | null;
  properties: Record<string, unknown>;
}

interface IncidentPanelProps {
  onShowEvacRoutes: (incident: IncidentSelection) => void;
  onShowAffectedArea: (incident: IncidentSelection) => void;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = { low: 'blue', medium: 'yellow', high: 'orange', critical: 'red' };
const AUTHOR = 'viewtopia';

export function IncidentPanel({ onShowEvacRoutes, onShowAffectedArea, onClose }: IncidentPanelProps) {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<string | null>('fire');
  const [newSeverity, setNewSeverity] = useState<string | null>('medium');
  const [newDesc, setNewDesc] = useState('');
  const [newLat, setNewLat] = useState<number | string>('');
  const [newLng, setNewLng] = useState<number | string>('');
  const [loading, setLoading] = useState(false);

  const toRow = (i: {
    id: string;
    incident_type: string | null;
    severity: string | null;
    status: string | null;
    lat: number | null;
    lng: number | null;
    reported_at: string | null;
    description: string | null;
    properties: Record<string, unknown>;
  }): Incident => {
    const units = i.properties.assigned_units;
    const pop = i.properties.affected_population;
    return {
      id: i.id,
      type: i.incident_type ?? 'unknown',
      description: i.description ?? '',
      severity: i.severity ?? 'low',
      status: i.status ?? 'active',
      lat: i.lat,
      lng: i.lng,
      reportedAt: i.reported_at ?? '',
      assignedUnits: Array.isArray(units) ? (units as string[]) : [],
      affectedPopulation: typeof pop === 'number' ? pop : 0,
      properties: i.properties,
    };
  };

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const branch = await discoverBranch(INCIDENTS_DATASET);
      if (!branch) {
        setError(missingDatasetMessage(INCIDENTS_DATASET, 'emergency'));
        setIncidents([]);
        return;
      }
      setBranchId(branch);
      const rows = await listIncidents(branch);
      setIncidents(rows.map(toRow));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async () => {
    if (!newDesc.trim() || newLat === '' || newLng === '') return;
    let branch = branchId;
    if (!branch) {
      branch = await discoverBranch(INCIDENTS_DATASET);
      if (!branch) {
        setError(missingDatasetMessage(INCIDENTS_DATASET, 'emergency'));
        return;
      }
      setBranchId(branch);
    }
    try {
      const created = await createIncident({
        branchId: branch,
        incidentType: newType ?? 'other',
        severity: newSeverity ?? 'medium',
        lat: Number(newLat),
        lng: Number(newLng),
        description: newDesc.trim(),
        author: AUTHOR,
      });
      setIncidents((prev) => [toRow(created), ...prev]);
      setNewDesc('');
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to report incident');
    }
  };

  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const criticalCount = activeIncidents.filter((i) => i.severity === 'critical').length;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconUrgent size={18} />
            <Text fw={600} size="sm">Incidents</Text>
          </Group>
          <ActionIcon aria-label="Close incidents" size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoad} loading={loading}>Load Incidents</Button>

        {error && <Text size="xs" c="dimmed" ta="center">{error}</Text>}

        <Group gap="xs">
          {criticalCount > 0 && <Badge color="red" size="sm" leftSection={<IconAlertTriangle size={10} />}>{criticalCount} critical</Badge>}
          <Badge color="gray" size="sm">{activeIncidents.length} active</Badge>
        </Group>

        {/* Report new */}
        <Divider label="Report" labelPosition="left" />
        <Group gap="xs">
          <Select size="xs" value={newType} onChange={setNewType} w={100}
            data={['fire', 'flood', 'accident', 'hazmat', 'medical'].map((t) => ({ value: t, label: t }))} />
          <Select size="xs" value={newSeverity} onChange={setNewSeverity} w={100}
            data={['low', 'medium', 'high', 'critical'].map((t) => ({ value: t, label: t }))} />
          <TextInput size="xs" placeholder="Description..." value={newDesc} onChange={(e) => setNewDesc(e.currentTarget.value)} style={{ flex: 1 }} />
        </Group>
        <Group gap="xs">
          <NumberInput size="xs" placeholder="Lat" value={newLat} onChange={setNewLat} decimalScale={6} style={{ flex: 1 }} />
          <NumberInput size="xs" placeholder="Lng" value={newLng} onChange={setNewLng} decimalScale={6} style={{ flex: 1 }} />
          <ActionIcon aria-label="Report incident" size="sm" onClick={handleReport} disabled={!newDesc.trim() || newLat === '' || newLng === ''}><IconPlus size={14} /></ActionIcon>
        </Group>

        {loaded && !error && activeIncidents.length === 0 && (
          <Text size="xs" c="dimmed" ta="center">No active incidents</Text>
        )}

        {/* Active incidents */}
        {activeIncidents.length > 0 && (
          <ScrollArea h={220}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Units</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activeIncidents.map((inc) => (
                  <Table.Tr key={inc.id} style={{ cursor: 'pointer' }} onClick={() => {
                    onShowAffectedArea(inc);
                    onShowEvacRoutes(inc);
                  }}>
                    <Table.Td><Text size="xs" fw={500}>{inc.type}</Text></Table.Td>
                    <Table.Td><Badge size="xs" color={SEVERITY_COLORS[inc.severity] ?? 'gray'}>{inc.severity}</Badge></Table.Td>
                    <Table.Td><Text size="xs">{inc.status}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light"><IconUsers size={10} /> {inc.assignedUnits.length}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
