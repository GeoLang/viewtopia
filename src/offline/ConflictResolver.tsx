/**
 * Conflict Resolution UI — shown when sync detects conflicting changes.
 * Presents a side-by-side diff view for each conflicting property.
 */

import { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Paper,
  SegmentedControl,
  Code,
  ScrollArea,
  Divider,
} from '@mantine/core';
import { IconGitMerge, IconCheck } from '@tabler/icons-react';
import type { MergeConflict, ConflictStrategy } from './conflicts';
import { resolveConflictManually } from './conflicts';

interface ConflictResolverProps {
  conflicts: MergeConflict[];
  onResolved: (results: Array<{ featureId: string; properties: Record<string, unknown>; geometry?: GeoJSON.Geometry }>) => void;
  onCancel: () => void;
}

export function ConflictResolver({ conflicts, onResolved, onCancel }: ConflictResolverProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, Record<string, 'ours' | 'theirs'>>>(new Map());

  const current = conflicts[currentIndex];
  const currentResolution = resolutions.get(current.featureId) || {};

  function setPropertyResolution(prop: string, choice: 'ours' | 'theirs') {
    const updated = new Map(resolutions);
    const featureRes = { ...(updated.get(current.featureId) || {}) };
    featureRes[prop] = choice;
    updated.set(current.featureId, featureRes);
    setResolutions(updated);
  }

  function handleResolveAll(strategy: ConflictStrategy) {
    const results = conflicts.map((c) => {
      const res: Record<string, 'ours' | 'theirs'> = {};
      for (const prop of c.conflictingProperties) {
        res[prop] = strategy === 'theirs' ? 'theirs' : 'ours';
      }
      return {
        featureId: c.featureId,
        ...resolveConflictManually(c, res),
      };
    });
    onResolved(results);
  }

  function handleFinish() {
    const results = conflicts.map((c) => {
      const res = resolutions.get(c.featureId) || {};
      // Default unresolved to 'ours'
      for (const prop of c.conflictingProperties) {
        if (!res[prop]) res[prop] = 'ours';
      }
      return {
        featureId: c.featureId,
        ...resolveConflictManually(c, res),
      };
    });
    onResolved(results);
  }

  const allResolved = conflicts.every((c) => {
    const res = resolutions.get(c.featureId);
    return res && c.conflictingProperties.every((p) => res[p]);
  });

  return (
    <Modal
      opened
      onClose={onCancel}
      title={
        <Group gap="xs">
          <IconGitMerge size={20} />
          <Text fw={600}>Resolve Conflicts</Text>
          <Badge size="sm" color="red">{conflicts.length}</Badge>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {conflicts.length} feature{conflicts.length > 1 ? 's' : ''} modified both locally and on the server.
          Choose which version to keep for each conflicting property.
        </Text>

        {/* Quick resolve buttons */}
        <Group gap="xs">
          <Button size="xs" variant="light" color="blue" onClick={() => handleResolveAll('ours')}>
            Keep All Mine
          </Button>
          <Button size="xs" variant="light" color="orange" onClick={() => handleResolveAll('theirs')}>
            Keep All Server
          </Button>
        </Group>

        <Divider />

        {/* Feature navigation */}
        {conflicts.length > 1 && (
          <Group justify="space-between">
            <Button size="xs" variant="subtle" disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}>
              ← Previous
            </Button>
            <Text size="xs" c="dimmed">
              Feature {currentIndex + 1} of {conflicts.length}
            </Text>
            <Button size="xs" variant="subtle" disabled={currentIndex === conflicts.length - 1}
              onClick={() => setCurrentIndex((i) => i + 1)}>
              Next →
            </Button>
          </Group>
        )}

        {/* Conflict detail for current feature */}
        <Paper p="sm" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={600}>Feature: {current.featureId}</Text>
            <Badge size="xs" color="yellow">{current.conflictType}</Badge>
          </Group>

          <ScrollArea h={300}>
            <Stack gap="xs">
              {current.conflictingProperties.map((prop) => (
                <Paper key={prop} p="xs" withBorder>
                  <Text size="xs" fw={600} mb={4}>{prop === '__geometry__' ? 'Geometry' : prop}</Text>
                  <Group grow gap="xs" align="flex-start">
                    <Stack gap={2}>
                      <Badge size="xs" color="blue" variant="light">Mine (local)</Badge>
                      <Code block style={{ fontSize: 11 }}>
                        {prop === '__geometry__'
                          ? JSON.stringify(current.ours?.geometry, null, 2)?.slice(0, 200)
                          : JSON.stringify(current.ours?.properties[prop], null, 2)}
                      </Code>
                    </Stack>
                    <Stack gap={2}>
                      <Badge size="xs" color="orange" variant="light">Server</Badge>
                      <Code block style={{ fontSize: 11 }}>
                        {prop === '__geometry__'
                          ? JSON.stringify(current.theirs?.geometry, null, 2)?.slice(0, 200)
                          : JSON.stringify(current.theirs?.properties[prop], null, 2)}
                      </Code>
                    </Stack>
                  </Group>
                  <SegmentedControl
                    size="xs"
                    mt="xs"
                    fullWidth
                    value={currentResolution[prop] || ''}
                    onChange={(v) => setPropertyResolution(prop, v as 'ours' | 'theirs')}
                    data={[
                      { value: 'ours', label: '← Keep Mine' },
                      { value: 'theirs', label: 'Keep Server →' },
                    ]}
                  />
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
        </Paper>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onCancel}>Cancel Sync</Button>
          <Button
            leftSection={<IconCheck size={14} />}
            onClick={handleFinish}
            disabled={!allResolved}
          >
            Apply Resolutions
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
