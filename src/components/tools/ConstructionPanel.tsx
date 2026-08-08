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
  Progress,
  Divider,
} from '@mantine/core';
import { IconX, IconCrane, IconCalendar, IconCamera } from '@tabler/icons-react';
import {
  discoverBranch,
  listSurveys,
  listMilestones,
  compareSurveys,
  CONSTRUCTION_DATASET,
  type ElevationStats,
} from '../../lib/verticals';
import { fetchBranchGeometry } from '../../lib/branchFeatures';

interface Survey {
  id: string;
  name: string;
  date: string;
  pointCount: number;
  meanElevation: number | null;
  geometry: GeoJSON.Geometry | null;
}

/** What the map side needs to draw a survey. */
export interface SurveySelection {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
}

interface ProgressMilestone {
  id: string;
  name: string;
  planned: number;
  actual: number;
  status: string;
  date: string;
}

interface ConstructionPanelProps {
  onLoadSurvey: (survey: SurveySelection) => void;
  onCompareSurveys: (base: SurveySelection, compare: SurveySelection) => void;
  onClose: () => void;
}

export function ConstructionPanel({ onLoadSurvey, onCompareSurveys, onClose }: ConstructionPanelProps) {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [milestones, setMilestones] = useState<ProgressMilestone[]>([]);
  const [baseSurvey, setBaseSurvey] = useState<string | null>(null);
  const [compareSurvey, setCompareSurvey] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ElevationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadSurveys = async () => {
    setLoading(true);
    setError(null);
    try {
      const branch = await discoverBranch(CONSTRUCTION_DATASET);
      if (!branch) {
        setError('No construction dataset configured');
        setSurveys([]);
        setMilestones([]);
        return;
      }
      setBranchId(branch);
      const [surveyRows, milestoneRows, geometry] = await Promise.all([
        listSurveys(branch),
        listMilestones(branch),
        fetchBranchGeometry(branch),
      ]);
      setSurveys(
        surveyRows.map((s) => ({
          id: s.id,
          name: s.name ?? s.id.slice(0, 8),
          date: s.date ?? '',
          pointCount: s.point_count ?? 0,
          meanElevation: s.mean_elevation,
          geometry: geometry.get(s.id) ?? null,
        })),
      );
      setMilestones(
        milestoneRows.map((m) => {
          const actual = m.completion_pct ?? 0;
          return {
            id: m.id,
            name: m.name ?? m.id.slice(0, 8),
            actual,
            planned: m.planned_pct ?? actual,
            status: m.status ?? '',
            date: m.due_date ?? '',
          };
        }),
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!branchId || !baseSurvey || !compareSurvey) return;
    const base = surveys.find((s) => s.id === baseSurvey);
    const compare = surveys.find((s) => s.id === compareSurvey);
    if (base && compare) onCompareSurveys(base, compare);
    try {
      const result = await compareSurveys(branchId, baseSurvey, compareSurvey);
      setComparison(result.elevation_diff_stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compare failed');
    }
  };

  const overallProgress = milestones.length > 0
    ? milestones.reduce((s, m) => s + m.actual, 0) / milestones.length
    : 0;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconCrane size={18} />
            <Text fw={600} size="sm">Construction</Text>
          </Group>
          <ActionIcon aria-label="Close construction" size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoadSurveys} loading={loading} leftSection={<IconCamera size={14} />}>
          Load Surveys
        </Button>

        {error && <Text size="xs" c="dimmed" ta="center">{error}</Text>}
        {loaded && !error && surveys.length === 0 && milestones.length === 0 && (
          <Text size="xs" c="dimmed" ta="center">No surveys or milestones found</Text>
        )}

        {milestones.length > 0 && (
          <>
            <Divider label="Progress" labelPosition="left" />
            <Group justify="space-between">
              <Text size="xs">Overall</Text>
              <Text size="xs" fw={600}>{overallProgress.toFixed(0)}%</Text>
            </Group>
            <Progress value={overallProgress} size="md" color={overallProgress >= 90 ? 'green' : overallProgress >= 50 ? 'blue' : 'orange'} />
            <ScrollArea h={120}>
              {milestones.map((m) => (
                <Group key={m.id} justify="space-between" py={2}>
                  <Text size="xs">{m.name}</Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color={m.actual >= m.planned ? 'green' : 'red'}>
                      {m.actual.toFixed(0)}% / {m.planned.toFixed(0)}%
                    </Badge>
                  </Group>
                </Group>
              ))}
            </ScrollArea>
          </>
        )}

        {surveys.length > 0 && (
          <>
            <Divider label="Cut/Fill Analysis" labelPosition="left" />
            <Group gap="xs" grow>
              <Select size="xs" label="Base" placeholder="Select..." value={baseSurvey} onChange={setBaseSurvey}
                data={surveys.map((s) => ({ value: s.id, label: `${s.name}${s.date ? ` (${s.date})` : ''}` }))} />
              <Select size="xs" label="Compare" placeholder="Select..." value={compareSurvey} onChange={setCompareSurvey}
                data={surveys.map((s) => ({ value: s.id, label: `${s.name}${s.date ? ` (${s.date})` : ''}` }))} />
            </Group>
            <Button size="xs" onClick={handleCompare} disabled={!baseSurvey || !compareSurvey} leftSection={<IconCalendar size={14} />}>
              Compare
            </Button>

            {comparison && (
              <Group gap="md">
                <Text size="xs" c="red">Cut: {comparison.max_cut.toFixed(1)} m</Text>
                <Text size="xs" c="green">Fill: {comparison.max_fill.toFixed(1)} m</Text>
                <Text size="xs" fw={500}>Net: {comparison.net_volume_m3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³</Text>
              </Group>
            )}

            <ScrollArea h={150}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Survey</Table.Th>
                    <Table.Th>Points</Table.Th>
                    <Table.Th>Mean Elev</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {surveys.map((s) => (
                    <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => onLoadSurvey(s)}>
                      <Table.Td><Text size="xs">{s.name}</Text></Table.Td>
                      <Table.Td><Text size="xs">{s.pointCount.toLocaleString()}</Text></Table.Td>
                      <Table.Td><Text size="xs">{s.meanElevation != null ? `${s.meanElevation.toFixed(1)} m` : '—'}</Text></Table.Td>
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
