import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Select,
  TextInput,
  Button,
  Paper,
  ActionIcon,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useSpaceTimeStore } from '../store';
import type { LinkKind } from '../types';

const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: 'colocation', label: 'Colocation (met in person)' },
  { value: 'communication', label: 'Communication (call/message)' },
  { value: 'financial', label: 'Financial (transaction)' },
  { value: 'organizational', label: 'Organizational (same group)' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'familial', label: 'Familial' },
  { value: 'travel', label: 'Travel' },
  { value: 'participation', label: 'Participation' },
  { value: 'reference', label: 'Reference' },
  { value: 'inferred', label: 'Inferred (analyst judgement)' },
];

export function CreateLinkDialog() {
  const entities = useSpaceTimeStore((s) => s.entities);
  const addLink = useSpaceTimeStore((s) => s.addLink);
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [kind, setKind] = useState<LinkKind>('colocation');
  const [evidence, setEvidence] = useState('');

  const entityOptions = Array.from(entities.values()).map((e) => ({
    value: e.id,
    label: e.name,
  }));

  const handleCreate = () => {
    if (!fromId || !toId || fromId === toId) return;
    addLink({
      id: crypto.randomUUID(),
      sourceId: fromId,
      targetId: toId,
      kind,
      timestamp: Date.now(),
      confidence: 1,
      evidence: evidence || undefined,
    });
    setFromId(null);
    setToId(null);
    setEvidence('');
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        size="xs"
        variant="light"
        color="violet"
        leftSection={<IconPlus size={12} />}
        onClick={() => setOpen(true)}
        disabled={entities.size < 2}
      >
        Create Link
      </Button>
    );
  }

  return (
    <Paper p="xs" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 6 }}>
      <Group justify="space-between" mb="xs">
        <Text size="xs" fw={600} c="white">
          Create Link
        </Text>
        <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setOpen(false)}>
          <IconX size={12} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        <Select
          size="xs"
          label="From Entity"
          data={entityOptions}
          value={fromId}
          onChange={setFromId}
          placeholder="Select entity…"
        />
        <Select
          size="xs"
          label="To Entity"
          data={entityOptions}
          value={toId}
          onChange={setToId}
          placeholder="Select entity…"
        />
        <Select
          size="xs"
          label="Link Type"
          data={LINK_KINDS}
          value={kind}
          onChange={(v) => v && setKind(v as LinkKind)}
        />
        <TextInput
          size="xs"
          label="Evidence / Notes"
          placeholder="Optional description…"
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
        />
        <Group gap="xs">
          <Button size="xs" variant="subtle" color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            color="violet"
            onClick={handleCreate}
            disabled={!fromId || !toId || fromId === toId}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
