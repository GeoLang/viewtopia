import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Button,
  TextInput,
  FileButton,
} from '@mantine/core';
import { IconDeviceFloppy, IconFolderOpen } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
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
    <PanelCard width={340}>
      <PanelHeader
        icon={<IconDeviceFloppy size={16} />}
        title="Project"
        onClose={onClose}
      />

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          A project holds the renderer, basemap, camera, split view, agent layers,
          markers, OGC services and image overlays. Overlay pictures stay in this
          browser, so a project opened elsewhere comes back without them.
        </Text>

        <TextInput
          size="xs"
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="project-name"
        />

        <Group gap="xs" grow>
          <Button
            size="xs"
            variant="filled"
            color="violet"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={() => void saveProjectFile(name)}
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
    </PanelCard>
  );
}
