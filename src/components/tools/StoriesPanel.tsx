import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Textarea,
  Button,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconBook, IconX, IconPlus, IconPlayerPlay, IconTrash } from '@tabler/icons-react';

interface StoryStep {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  zoom: number;
}

export function StoriesPanel({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<StoryStep[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [playing, setPlaying] = useState(false);

  const handleAddStep = () => {
    if (!title.trim()) return;
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        lat: 0,
        lng: 0,
        zoom: 8,
      },
    ]);
    setTitle('');
    setDescription('');
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
        width: 300,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBook size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Stories
          </Text>
          <Badge size="xs" variant="light" color="violet">
            {steps.length} steps
          </Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" mb="xs">
        <TextInput
          size="xs"
          placeholder="Step title…"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Textarea
          size="xs"
          placeholder="Description…"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          leftSection={<IconPlus size={14} />}
          onClick={handleAddStep}
          disabled={!title.trim()}
        >
          Add Step (at current view)
        </Button>
      </Stack>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {steps.map((step, i) => (
            <Group key={step.id} justify="space-between" p="xs"
              style={{ background: '#21262d', borderRadius: 4 }}
            >
              <div>
                <Text size="xs" c="white" fw={500}>
                  {i + 1}. {step.title}
                </Text>
                {step.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {step.description}
                  </Text>
                )}
              </div>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => setSteps((p) => p.filter((s) => s.id !== step.id))}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>

      {steps.length > 0 && (
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={<IconPlayerPlay size={14} />}
          onClick={() => setPlaying(!playing)}
          mt="xs"
          fullWidth
        >
          {playing ? 'Stop Story' : 'Play Story'}
        </Button>
      )}
    </Paper>
  );
}
