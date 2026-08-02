import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  FileButton,
} from '@mantine/core';
import { IconDeviceFloppy, IconX, IconFolderOpen } from '@tabler/icons-react';
import { applyProject, parseProject, saveProjectFile } from './projectFile';

export function ProjectPanel({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('workspace');
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  const open = async (file: File) => {
    try {
      const project = parseProject(await file.text());
      applyProject(project);
      setStatus({ text: `Opened ${project.name}`, failed: false });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : 'could not read project',
        failed: true,
      });
    }
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
        width: 340,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconDeviceFloppy size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Project
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          A project holds the renderer, basemap, camera, split view, agent layers,
          markers and OGC services.
        </Text>

        <TextInput
          size="xs"
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="project-name"
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Group gap="xs" grow>
          <Button
            size="xs"
            variant="filled"
            color="violet"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={() => saveProjectFile(name)}
          >
            Save
          </Button>
          <FileButton onChange={(file) => file && void open(file)} accept=".json">
            {(props) => (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconFolderOpen size={14} />}
                {...props}
              >
                Open
              </Button>
            )}
          </FileButton>
        </Group>

        {status && (
          <Text size="xs" c={status.failed ? 'red' : 'green'} data-testid="project-status">
            {status.text}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
