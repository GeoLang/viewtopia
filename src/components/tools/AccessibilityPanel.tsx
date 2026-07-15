import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
} from '@mantine/core';
import { IconAccessible, IconX } from '@tabler/icons-react';
import { useAccessibilityStore } from '../../store/accessibility';

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const largeText = useAccessibilityStore((s) => s.largeText);
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const setHighContrast = useAccessibilityStore((s) => s.setHighContrast);
  const setLargeText = useAccessibilityStore((s) => s.setLargeText);
  const setReduceMotion = useAccessibilityStore((s) => s.setReduceMotion);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconAccessible size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Accessibility
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="High Contrast"
          checked={highContrast}
          onChange={(e) => setHighContrast(e.currentTarget.checked)}
          color="violet"
        />
        <Switch
          size="xs"
          label="Large Text"
          checked={largeText}
          onChange={(e) => setLargeText(e.currentTarget.checked)}
          color="violet"
        />
        <Switch
          size="xs"
          label="Reduced Motion"
          checked={reduceMotion}
          onChange={(e) => setReduceMotion(e.currentTarget.checked)}
          color="violet"
        />
        <Text size="xs" c="dimmed">
          Reduced motion skips camera flight animations in bookmarks and stories.
        </Text>
      </Stack>
    </Paper>
  );
}
