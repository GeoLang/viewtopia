import { useState, useRef, useCallback } from 'react';
import {
  Paper,
  Tabs,
  Text,
  Group,
  ActionIcon,
  Stack,
  Button,
  ScrollArea,
  Badge,
  Box,
} from '@mantine/core';
import {
  IconX,
  IconClock,
  IconUsers,
  IconLink,
  IconChartBar,
  IconUpload,
  IconFileTypeCsv,
} from '@tabler/icons-react';
import { useSpaceTimeStore } from './store';
import { EntityList } from './components/EntityList';
import { TrackPlayer } from './components/TrackPlayer';
import { CreateLinkDialog } from './components/CreateLinkDialog';
import type { Entity } from './types';

export function SpaceTimePanel() {
  const { panelOpen, togglePanel, entities, tracks, links, addEntity, addTrack, setTimeRange, flyTo } =
    useSpaceTimeStore();
  const importStatus = useSpaceTimeStore((s) => s.importStatus);
  const setImportStatus = useSpaceTimeStore((s) => s.setImportStatus);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvFile = useCallback((file: File) => {
    setImportStatus(null);
    if (!file.name.endsWith('.csv')) {
      setImportStatus('Only CSV files are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setImportStatus('CSV has no data rows');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === 'name' || h === 'entity');
      const kindIdx = headers.findIndex((h) => h === 'kind' || h === 'type');
      const latIdx = headers.findIndex((h) => h === 'lat' || h === 'latitude');
      const lngIdx = headers.findIndex((h) => h === 'lng' || h === 'lon' || h === 'longitude');
      const timeIdx = headers.findIndex((h) => h === 'timestamp' || h === 'time' || h === 'datetime' || h === 'date');

      if (nameIdx === -1) {
        setImportStatus('CSV must have a "name" column');
        return;
      }

      // Group rows by entity name for track building
      const entityRows: Map<string, { lat: number; lng: number; timestamp: number; kind: string }[]> = new Map();
      let minTime = Infinity;
      let maxTime = -Infinity;
      const allLats: number[] = [];
      const allLngs: number[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const name = cols[nameIdx];
        if (!name) continue;
        const kind = kindIdx >= 0 ? cols[kindIdx] : 'person';
        const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
        const lng = lngIdx >= 0 ? parseFloat(cols[lngIdx]) : NaN;
        let timestamp = 0;
        if (timeIdx >= 0) {
          const raw = cols[timeIdx];
          const parsed = Date.parse(raw);
          timestamp = isNaN(parsed) ? parseFloat(raw) || 0 : parsed;
        }

        if (!entityRows.has(name)) entityRows.set(name, []);
        entityRows.get(name)!.push({ lat, lng, timestamp, kind });

        if (!isNaN(lat)) allLats.push(lat);
        if (!isNaN(lng)) allLngs.push(lng);
        if (timestamp > 0) {
          minTime = Math.min(minTime, timestamp);
          maxTime = Math.max(maxTime, timestamp);
        }
      }

      // Create entities and tracks
      let entityCount = 0;
      for (const [name, rows] of entityRows) {
        const entityId = crypto.randomUUID();
        const kind = (rows[0].kind || 'person') as Entity['kind'];
        addEntity({
          id: entityId,
          name,
          kind,
          aliases: [],
          color: '#a78bfa',
          properties: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        entityCount++;

        // Build track from rows with valid coordinates
        const events = rows
          .filter((r) => !isNaN(r.lat) && !isNaN(r.lng))
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((r) => ({
            id: crypto.randomUUID(),
            entityId,
            lat: r.lat,
            lng: r.lng,
            timestamp: r.timestamp,
          }));

        if (events.length > 0) {
          addTrack({ id: crypto.randomUUID(), entityId, events });
        }
      }

      // Set time range if we have temporal data
      if (minTime < Infinity && maxTime > -Infinity) {
        setTimeRange({ min: minTime, max: maxTime });
      }

      // Fly to bounding box center
      if (allLats.length > 0 && allLngs.length > 0) {
        const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
        const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;
        const latSpan = Math.max(...allLats) - Math.min(...allLats);
        const lngSpan = Math.max(...allLngs) - Math.min(...allLngs);
        const span = Math.max(latSpan, lngSpan);
        // Rough zoom estimation from span
        const zoom = span > 90 ? 2 : span > 30 ? 4 : span > 10 ? 6 : span > 1 ? 8 : span > 0.1 ? 11 : 13;
        flyTo(centerLng, centerLat, zoom);
      }

      setImportStatus(`Imported ${entityCount} entities, ${allLats.length} positions`);
    };
    reader.readAsText(file);
  }, [addEntity, addTrack, setTimeRange, flyTo, setImportStatus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  }, [handleCsvFile]);

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
    e.target.value = '';
  }, [handleCsvFile]);

  if (!panelOpen) return null;

  return (
    <Paper
      shadow="xl"
      radius="md"
      style={{
        position: 'absolute',
        top: 60,
        left: 16,
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
          <Stack gap="xs">
            <Box
              onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={handleBrowse}
              style={{
                border: `2px dashed ${dragging ? '#a78bfa' : '#30363d'}`,
                borderRadius: 8,
                padding: '12px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'rgba(167, 139, 250, 0.05)' : 'transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Group justify="center" gap="xs">
                <IconFileTypeCsv size={18} color={dragging ? '#a78bfa' : '#8b949e'} />
                <Text size="xs" c={dragging ? 'violet' : 'dimmed'}>
                  Drop CSV here or click to browse
                </Text>
                <IconUpload size={14} color={dragging ? '#a78bfa' : '#8b949e'} />
              </Group>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </Box>
            {importStatus && (
              <Text size="xs" c="violet" ta="center" data-testid="spacetime-import-status">
                {importStatus}
              </Text>
            )}
            <EntityList />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="timeline" p="xs">
          <TrackPlayer />
        </Tabs.Panel>

        <Tabs.Panel value="links" p="xs">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {links.length} links between entities
            </Text>
            <CreateLinkDialog />
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
