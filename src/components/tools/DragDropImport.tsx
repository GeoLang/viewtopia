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

interface DragDropImportProps {
  onImport: (file: File) => void;
  onClose: () => void;
}

const SUPPORTED = ['.geojson', '.json', '.gpx', '.kml', '.csv', '.kmz'];

export function DragDropImport({ onImport, onClose }: DragDropImportProps) {
  const handleFiles = (files: File[]) => {
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!SUPPORTED.includes(ext)) {
        notifications.show({
          title: 'Unsupported file',
          message: `${file.name} — supported: ${SUPPORTED.join(', ')}`,
          color: 'red',
        });
        continue;
      }
      onImport(file);
      notifications.show({
        title: 'Imported',
        message: file.name,
        color: 'green',
      });
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
        style={{
          border: '2px dashed #30363d',
          borderRadius: 8,
          background: '#0d1117',
        }}
      >
        <IconFile size={32} color="#484f58" />
        <Text size="sm" c="dimmed" ta="center">
          Drop files here or click Browse
        </Text>
        <Text size="xs" c="dimmed">
          {SUPPORTED.join(', ')}
        </Text>
        <FileButton
          onChange={(files) => files && handleFiles(Array.isArray(files) ? files : [files])}
          accept={SUPPORTED.join(',')}
          multiple
        >
          {(props) => (
            <Button size="xs" color="violet" {...props}>
              Browse Files
            </Button>
          )}
        </FileButton>
      </Stack>
    </Paper>
  );
}
