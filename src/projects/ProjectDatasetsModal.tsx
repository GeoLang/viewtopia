import { useCallback, useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useAuthStore } from '../features/auth/store';
import { type DatasetRecord, fetchDatasets } from '../lib/branchFeatures';
import { attachDataset, detachDataset } from './api';
import { currentSession, reportFailure } from './requestFeedback';

interface ProjectDatasetsModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export function ProjectDatasetsModal({ opened, onClose, projectId, projectName }: ProjectDatasetsModalProps) {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [pending, setPending] = useState(false);

  const loadDatasets = useCallback(async () => {
    const token = useAuthStore.getState().token;
    try {
      const listed = await fetchDatasets();
      if (currentSession(token)) setDatasets(listed);
    } catch (failure) {
      reportFailure('Could not load datasets', failure);
    }
  }, []);

  useEffect(() => {
    if (!opened) return;
    void loadDatasets();
  }, [opened, loadDatasets]);

  async function runAttachment(title: string, change: () => Promise<unknown>): Promise<void> {
    const token = useAuthStore.getState().token;
    setPending(true);
    try {
      await change();
      await loadDatasets();
    } catch (failure) {
      reportFailure(title, failure);
    } finally {
      if (currentSession(token)) setPending(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Manage datasets for "${projectName}"`} size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          Attaching makes the dataset private to the project's members. Detaching leaves it private.
        </Text>
        {datasets.map((dataset) => (
          <Group key={dataset.id} justify="space-between" wrap="nowrap" data-testid="project-dataset-row">
            <Text size="sm">{dataset.name}</Text>
            {dataset.project_id === null && (
              <Button
                size="xs"
                variant="light"
                disabled={pending}
                onClick={() => void runAttachment(
                  'Could not attach the dataset',
                  () => attachDataset(dataset.id, projectId),
                )}
              >
                Attach
              </Button>
            )}
            {dataset.project_id === projectId && (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                disabled={pending}
                onClick={() => void runAttachment(
                  'Could not detach the dataset',
                  () => detachDataset(dataset.id),
                )}
              >
                Detach
              </Button>
            )}
            {dataset.project_id !== null && dataset.project_id !== projectId && (
              <Text size="xs" c="dimmed">in another project</Text>
            )}
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}
