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
import { ACCEPT_FORMATS, importFiles, type ImportStatus } from '../../lib/importFiles';

interface DragDropImportProps {
  onImport: (name: string, geojson: GeoJSON.FeatureCollection) => void;
  onClose: () => void;
}

export function DragDropImport({ onImport, onClose }: DragDropImportProps) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);

  const handleFiles = (files: File[]) => importFiles(files, onImport, setStatus);

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
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 400,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconUpload size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Import Data
          </Text>
        </Group>
        <ActionIcon aria-label="Close import" size="sm" variant="subtle" color="gray" onClick={onClose}>
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
          border: `2px dashed ${dragging ? 'var(--mantine-color-violet-4)' : 'var(--mantine-color-dark-5)'}`,
          borderRadius: 8,
          background: 'var(--mantine-color-dark-8)',
        }}
      >
        <IconFile size={32} style={{ color: 'var(--mantine-color-dark-4)' }} />
        <Text size="sm" c="dimmed" ta="center">
          Drop files here or click Browse
        </Text>
        <Text size="xs" c="dimmed">
          {ACCEPT_FORMATS.join(', ')}
        </Text>
        <FileButton
          onChange={(files) => files && void handleFiles(Array.isArray(files) ? files : [files])}
          accept={ACCEPT_FORMATS.join(',')}
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
