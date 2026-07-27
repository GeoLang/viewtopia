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
  Slider,
} from '@mantine/core';
import { IconCube, IconX, IconUpload } from '@tabler/icons-react';

export function ModelImportPanel({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState(1);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 270,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconCube size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            3D Model Import
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <FileButton
          onChange={setFile}
          accept=".gltf,.glb,.obj,.fbx,.ifc,.3ds,.dae"
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
              {file ? file.name : 'Select 3D Model'}
            </Button>
          )}
        </FileButton>

        {file && (
          <Badge size="xs" variant="light" color="violet">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </Badge>
        )}

        <Text size="xs" c="dimmed">Scale: {scale.toFixed(1)}x</Text>
        <Slider size="xs" min={0.1} max={10} step={0.1} value={scale} onChange={setScale} color="violet" />

        <Text size="xs" c="dimmed">
          Click on the map to place the model at a geographic position.
        </Text>

        <Button size="xs" variant="filled" color="violet" disabled={!file} fullWidth>
          Place on Map
        </Button>
      </Stack>
    </Paper>
  );
}
