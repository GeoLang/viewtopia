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

interface SurveyComparison {
  id: string;
  name: string;
  date: string;
  cutVolume: number; // cubic meters
  fillVolume: number;
  netVolume: number;
  area: number; // sq meters
  pointCount: number;
}

interface ProgressMilestone {
  id: string;
  name: string;
  planned: number; // percentage
  actual: number;
  date: string;
}

interface ConstructionPanelProps {
  onLoadSurvey: (surveyId: string) => void;
  onCompareSurveys: (baseId: string, compareId: string) => void;
  onClose: () => void;
}

export function ConstructionPanel({ onLoadSurvey, onCompareSurveys, onClose }: ConstructionPanelProps) {
  const [surveys, setSurveys] = useState<SurveyComparison[]>([]);
  const [milestones, setMilestones] = useState<ProgressMilestone[]>([]);
  const [baseSurvey, setBaseSurvey] = useState<string | null>(null);
  const [compareSurvey, setCompareSurvey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoadSurveys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/construction/surveys');
      const data = await res.json();
      setSurveys(data.surveys || []);
      setMilestones(data.milestones || []);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  const handleCompare = () => {
    if (baseSurvey && compareSurvey) {
      onCompareSurveys(baseSurvey, compareSurvey);
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
          <ActionIcon size="sm" variant="subtle" onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>

        <Button size="xs" onClick={handleLoadSurveys} loading={loading} leftSection={<IconCamera size={14} />}>
          Load Surveys
        </Button>

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
                      {m.actual}% / {m.planned}%
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
                data={surveys.map((s) => ({ value: s.id, label: `${s.name} (${s.date})` }))} />
              <Select size="xs" label="Compare" placeholder="Select..." value={compareSurvey} onChange={setCompareSurvey}
                data={surveys.map((s) => ({ value: s.id, label: `${s.name} (${s.date})` }))} />
            </Group>
            <Button size="xs" onClick={handleCompare} disabled={!baseSurvey || !compareSurvey} leftSection={<IconCalendar size={14} />}>
              Compare
            </Button>

            <ScrollArea h={150}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Survey</Table.Th>
                    <Table.Th>Cut (m³)</Table.Th>
                    <Table.Th>Fill (m³)</Table.Th>
                    <Table.Th>Net</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {surveys.map((s) => (
                    <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => onLoadSurvey(s.id)}>
                      <Table.Td><Text size="xs">{s.name}</Text></Table.Td>
                      <Table.Td><Text size="xs" c="red">{s.cutVolume.toLocaleString()}</Text></Table.Td>
                      <Table.Td><Text size="xs" c="green">{s.fillVolume.toLocaleString()}</Text></Table.Td>
                      <Table.Td><Text size="xs" fw={500}>{s.netVolume.toLocaleString()}</Text></Table.Td>
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
