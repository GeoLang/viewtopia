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
  Select,
  Divider,
  Timeline,
} from '@mantine/core';
import {
  IconX,
  IconUrgent,
  IconAlertTriangle,
  IconRoute,
  IconUsers,
  IconPlus,
} from '@tabler/icons-react';

type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
type IncidentStatus = 'reported' | 'dispatched' | 'on-scene' | 'resolved';

interface Incident {
  id: string;
  type: string; // fire, flood, accident, hazmat, medical
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  lat: number;
  lng: number;
  reportedAt: string;
  assignedUnits: string[];
  affectedPopulation: number;
}

interface EvacRoute {
  id: string;
  name: string;
  capacity: number; // people/hour
  distance: number; // km
  estimatedTime: number; // minutes
  status: 'clear' | 'congested' | 'blocked';
}

interface IncidentPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onShowEvacRoutes: (incidentId: string) => void;
  onShowAffectedArea: (lat: number, lng: number, radiusM: number) => void;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<IncidentSeverity, string> = { low: 'blue', medium: 'yellow', high: 'orange', critical: 'red' };

export function IncidentPanel({ onFlyTo, onShowEvacRoutes, onShowAffectedArea, onClose }: IncidentPanelProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [evacRoutes, setEvacRoutes] = useState<EvacRoute[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [newType, setNewType] = useState<string | null>('fire');
  const [newDesc, setNewDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emergency/incidents');
      const data = await res.json();
      setIncidents(data.incidents || []);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  const handleEvacRoutes = async (incidentId: string) => {
    setSelectedIncident(incidentId);
    onShowEvacRoutes(incidentId);
    try {
      const res = await fetch(`/api/emergency/incidents/${incidentId}/evacuation`);
      const data = await res.json();
      setEvacRoutes(data.routes || []);
    } catch { /* */ }
  };

  const handleReport = async () => {
    if (!newDesc.trim()) return;
    try {
      await fetch('/api/emergency/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, description: newDesc }),
      });
      setNewDesc('');
      handleLoad();
    } catch { /* */ }
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
          <ActionIcon size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoad} loading={loading}>Load Incidents</Button>

        <Group gap="xs">
          {criticalCount > 0 && <Badge color="red" size="sm" leftSection={<IconAlertTriangle size={10} />}>{criticalCount} critical</Badge>}
          <Badge color="gray" size="sm">{activeIncidents.length} active</Badge>
        </Group>

        {/* Report new */}
        <Divider label="Report" labelPosition="left" />
        <Group gap="xs">
          <Select size="xs" value={newType} onChange={setNewType} w={100}
            data={['fire', 'flood', 'accident', 'hazmat', 'medical'].map((t) => ({ value: t, label: t }))} />
          <TextInput size="xs" placeholder="Description..." value={newDesc} onChange={(e) => setNewDesc(e.currentTarget.value)} style={{ flex: 1 }} />
          <ActionIcon size="sm" onClick={handleReport}><IconPlus size={14} /></ActionIcon>
        </Group>

        {/* Active incidents */}
        {activeIncidents.length > 0 && (
          <ScrollArea h={200}>
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
                  <Table.Tr key={inc.id} style={{ cursor: 'pointer' }} onClick={() => { onFlyTo(inc.lat, inc.lng, 15); onShowAffectedArea(inc.lat, inc.lng, 1000); }}>
                    <Table.Td><Text size="xs" fw={500}>{inc.type}</Text></Table.Td>
                    <Table.Td><Badge size="xs" color={SEVERITY_COLORS[inc.severity]}>{inc.severity}</Badge></Table.Td>
                    <Table.Td><Text size="xs">{inc.status}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light"><IconUsers size={10} /> {inc.assignedUnits.length}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}

        {/* Evacuation routes for selected incident */}
        {selectedIncident && evacRoutes.length > 0 && (
          <>
            <Divider label="Evacuation Routes" labelPosition="left" />
            <Timeline active={-1} bulletSize={16} lineWidth={2}>
              {evacRoutes.map((r) => (
                <Timeline.Item key={r.id} title={r.name} bullet={<IconRoute size={10} />}>
                  <Group gap="xs">
                    <Text size="xs">{r.distance.toFixed(1)} km</Text>
                    <Text size="xs">~{r.estimatedTime} min</Text>
                    <Badge size="xs" color={r.status === 'clear' ? 'green' : r.status === 'congested' ? 'yellow' : 'red'}>{r.status}</Badge>
                  </Group>
                </Timeline.Item>
              ))}
            </Timeline>
          </>
        )}
      </Stack>
    </Paper>
  );
}
