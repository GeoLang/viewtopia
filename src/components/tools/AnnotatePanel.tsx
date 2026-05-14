import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  Textarea,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconMapPin, IconX, IconPlus, IconTrash } from '@tabler/icons-react';

interface Annotation {
  id: string;
  label: string;
  note: string;
  lat: number;
  lng: number;
  createdAt: number;
}

export function AnnotatePanel({ onClose }: { onClose: () => void }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const handleAdd = () => {
    if (!label.trim()) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: label.trim(),
        note: note.trim(),
        lat: 0,
        lng: 0,
        createdAt: Date.now(),
      },
    ]);
    setLabel('');
    setNote('');
    setPlacing(false);
  };

  const handleRemove = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
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
        maxHeight: 'calc(100vh - 120px)',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconMapPin size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Annotations
          </Text>
          <Badge size="xs" variant="light" color="violet">
            {annotations.length}
          </Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Annotation label…"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Textarea
          size="xs"
          placeholder="Note (optional)…"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          minRows={2}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconPlus size={12} />}
            onClick={() => setPlacing(true)}
            flex={1}
          >
            {placing ? 'Click map to place…' : 'Add Annotation'}
          </Button>
          {placing && (
            <Button size="xs" color="violet" onClick={handleAdd}>
              Save
            </Button>
          )}
        </Group>
      </Stack>

      <ScrollArea flex={1} mt="xs">
        <Stack gap={4}>
          {annotations.map((a) => (
            <Group
              key={a.id}
              p="xs"
              style={{ background: '#21262d', borderRadius: 4 }}
              justify="space-between"
              wrap="nowrap"
            >
              <Stack gap={0}>
                <Text size="xs" c="white" fw={500}>
                  {a.label}
                </Text>
                {a.note && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {a.note}
                  </Text>
                )}
              </Stack>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => handleRemove(a.id)}
              >
                <IconTrash size={10} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
