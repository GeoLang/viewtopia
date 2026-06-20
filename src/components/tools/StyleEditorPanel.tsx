import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  Slider,
  Divider,
} from '@mantine/core';
import { IconPalette, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  colorByProperty,
  colorByHeight,
  colorByClassification,
  resetStyle,
  setOpacity,
  setPointSize,
} from '../../viewer/tileStyles';

export function StyleEditorPanel({ onClose }: { onClose: () => void }) {
  const [prop, setProp] = useState('');
  const [opacity, setOpacityVal] = useState(1);
  const [pointSize, setPointSizeVal] = useState(3);

  // Run a styling action; warn if there are no tilesets to style.
  const run = (fn: () => number) => {
    const n = fn();
    if (n === 0) {
      notifications.show({
        title: 'No 3D tilesets',
        message: 'Load a 3D Tiles layer first (e.g. via the agent or a tileset URL).',
        color: 'yellow',
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
        width: 300,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconPalette size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Style Editor
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="sm">
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            Color by Property
          </Text>
          <Group gap={4} wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="Property name"
              value={prop}
              onChange={(e) => setProp(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              size="xs"
              variant="light"
              color="violet"
              onClick={() => run(() => colorByProperty(prop))}
            >
              Apply
            </Button>
          </Group>
        </Stack>

        <Group gap={6} grow>
          <Button size="xs" variant="light" color="violet" onClick={() => run(colorByHeight)}>
            By Height
          </Button>
          <Button size="xs" variant="light" color="violet" onClick={() => run(colorByClassification)}>
            By Class
          </Button>
        </Group>
        <Button size="xs" variant="subtle" color="gray" onClick={() => run(resetStyle)}>
          Reset Style
        </Button>

        <Divider color="#30363d" />

        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            Opacity: {opacity.toFixed(2)}
          </Text>
          <Slider
            size="xs"
            color="violet"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={setOpacityVal}
            onChangeEnd={(v) => run(() => setOpacity(v))}
          />
        </Stack>

        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            Point Size: {pointSize}
          </Text>
          <Slider
            size="xs"
            color="violet"
            min={1}
            max={20}
            step={1}
            value={pointSize}
            onChange={setPointSizeVal}
            onChangeEnd={(v) => run(() => setPointSize(v))}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}
