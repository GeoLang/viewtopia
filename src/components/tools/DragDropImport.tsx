import { useState } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Button,
  Stack,
  FileButton,
} from '@mantine/core';
import { IconUpload, IconX, IconFile } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { IMPORT_FORMATS, parseImport } from '../../lib/importGeoJson';
import { timedImport, loadTimedImport } from '../../lib/importTime';

interface DragDropImportProps {
  onImport: (name: string, geojson: GeoJSON.FeatureCollection) => void;
  onClose: () => void;
}

export function DragDropImport({ onImport, onClose }: DragDropImportProps) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!IMPORT_FORMATS.includes(ext)) {
        setStatus({ text: `${file.name}: unsupported file`, failed: true });
        notifications.show({
          title: 'Unsupported file',
          message: `${file.name} — supported: ${IMPORT_FORMATS.join(', ')}`,
          color: 'red',
        });
        continue;
      }
      try {
        const collection = parseImport(file.name, await file.text());
        const count = `${collection.features.length} features`;
        // timestamped data goes in as CZML so the clock can play it. with no
        // Cesium viewer it takes the plain-geometry path every renderer draws
        const timed = timedImport(collection);
        const onTimeline = timed ? await loadTimedImport(file.name, timed) : false;
        if (!onTimeline) onImport(file.name, collection);
        const summary = onTimeline
          ? `${count}, ${timed?.features.length} on the timeline`
          : timed
            ? `${count}, timeline needs CesiumJS`
            : count;
        setStatus({ text: `${file.name}: ${summary}`, failed: false });
        notifications.show({
          title: 'Imported',
          message: `${file.name} — ${summary}`,
          color: 'green',
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'parse error';
        setStatus({ text: `${file.name}: ${reason}`, failed: true });
        notifications.show({
          title: 'Import failed',
          message: `${file.name} — ${reason}`,
          color: 'red',
        });
      }
    }
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="md"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 360,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 400,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconUpload size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Import Data
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack
        align="center"
        justify="center"
        p="xl"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles([...e.dataTransfer.files]);
        }}
        style={{
          border: `2px dashed ${dragging ? '#a78bfa' : '#30363d'}`,
          borderRadius: 8,
          background: '#0d1117',
        }}
      >
        <IconFile size={32} color="#484f58" />
        <Text size="sm" c="dimmed" ta="center">
          Drop files here or click Browse
        </Text>
        <Text size="xs" c="dimmed">
          {IMPORT_FORMATS.join(', ')}
        </Text>
        <FileButton
          onChange={(files) => files && void handleFiles(Array.isArray(files) ? files : [files])}
          accept={IMPORT_FORMATS.join(',')}
          multiple
        >
          {(props) => (
            <Button size="xs" color="violet" {...props}>
              Browse Files
            </Button>
          )}
        </FileButton>
      </Stack>

      {status && (
        <Text
          size="xs"
          mt="xs"
          ta="center"
          c={status.failed ? 'red' : 'green'}
          data-testid="import-status"
        >
          {status.text}
        </Text>
      )}
    </Paper>
  );
}
