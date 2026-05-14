import { useState } from 'react';
import {
  Paper,
  Tabs,
  Text,
  Group,
  ActionIcon,
  Stack,
  TextInput,
  Button,
  ScrollArea,
  Badge,
  Slider,
  Switch,
} from '@mantine/core';
import {
  IconX,
  IconClock,
  IconUsers,
  IconLink,
  IconTarget,
  IconChartBar,
  IconPlayerPlay,
  IconPlayerPause,
  IconSearch,
  IconPlus,
} from '@tabler/icons-react';
import { useSpaceTimeStore } from './store';
import { EntityList } from './components/EntityList';
import { TrackPlayer } from './components/TrackPlayer';

export function SpaceTimePanel() {
  const { panelOpen, togglePanel, entities, tracks, links } =
    useSpaceTimeStore();

  if (!panelOpen) return null;

  return (
    <Paper
      shadow="xl"
      radius="md"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 380,
        maxHeight: 'calc(100vh - 120px)',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group
        justify="space-between"
        p="xs"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        <Group gap="xs">
          <IconClock size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Space-Time Intelligence
          </Text>
        </Group>
        <Group gap={4}>
          <Badge size="xs" variant="light" color="violet">
            {entities.size} entities
          </Badge>
          <Badge size="xs" variant="light" color="blue">
            {tracks.length} tracks
          </Badge>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={togglePanel}
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <Tabs defaultValue="entities" variant="pills" radius="sm">
        <Tabs.List px="xs" pt="xs">
          <Tabs.Tab value="entities" leftSection={<IconUsers size={12} />} size="xs">
            Entities
          </Tabs.Tab>
          <Tabs.Tab value="timeline" leftSection={<IconClock size={12} />} size="xs">
            Timeline
          </Tabs.Tab>
          <Tabs.Tab value="links" leftSection={<IconLink size={12} />} size="xs">
            Links
          </Tabs.Tab>
          <Tabs.Tab value="analysis" leftSection={<IconChartBar size={12} />} size="xs">
            Analysis
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="entities" p="xs">
          <EntityList />
        </Tabs.Panel>

        <Tabs.Panel value="timeline" p="xs">
          <TrackPlayer />
        </Tabs.Panel>

        <Tabs.Panel value="links" p="xs">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {links.length} links between entities
            </Text>
            <ScrollArea mah={300}>
              {links.map((link) => (
                <Group
                  key={link.id}
                  p="xs"
                  mb={4}
                  style={{ background: '#21262d', borderRadius: 4 }}
                  justify="space-between"
                >
                  <Text size="xs" c="white">
                    {entities.get(link.sourceId)?.name ?? link.sourceId} →{' '}
                    {entities.get(link.targetId)?.name ?? link.targetId}
                  </Text>
                  <Badge size="xs" variant="light" color="violet">
                    {link.kind}
                  </Badge>
                </Group>
              ))}
            </ScrollArea>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="analysis" p="xs">
          <Stack gap="xs">
            <Button size="xs" variant="light" color="violet" fullWidth>
              Colocation Detection
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Pattern-of-Life
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Network Metrics
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Behavioral Clustering
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Predictive Location
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Entity Resolution
            </Button>
            <Button size="xs" variant="light" color="violet" fullWidth>
              Data Quality Check
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
