import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  FileButton,
  Badge,
  Switch,
} from '@mantine/core';
import { IconMapRoute, IconX, IconUpload } from '@tabler/icons-react';

export function TrackImportPanel({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [showElevation, setShowElevation] = useState(true);
  const [showSpeed, setShowSpeed] = useState(false);

  const handleFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMapRoute size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Track Import
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <FileButton
          onChange={(f) => f && handleFiles(Array.isArray(f) ? f : [f])}
          accept=".gpx,.kml,.kmz,.fit,.tcx"
          multiple
        >
          {(props) => (
            <Button
              size="xs"
              variant="subtle"
              color="violet"
              leftSection={<IconUpload size={14} />}
              fullWidth
              {...props}
            >
              Import GPX/KML/FIT
            </Button>
          )}
        </FileButton>

        {files.length > 0 && (
          <Stack gap={2}>
            {files.map((f, i) => (
              <Group key={i} justify="space-between">
                <Text size="xs" c="white" lineClamp={1}>{f.name}</Text>
                <Badge size="xs" variant="light">{(f.size / 1024).toFixed(0)}KB</Badge>
              </Group>
            ))}
          </Stack>
        )}

        <Switch
          size="xs"
          label="Color by Elevation"
          checked={showElevation}
          onChange={(e) => setShowElevation(e.currentTarget.checked)}
          color="violet"
        />

        <Switch
          size="xs"
          label="Color by Speed"
          checked={showSpeed}
          onChange={(e) => setShowSpeed(e.currentTarget.checked)}
          color="violet"
        />
      </Stack>
    </Paper>
  );
}
