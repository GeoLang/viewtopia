import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Select,
} from '@mantine/core';
import { IconAccessible, IconX } from '@tabler/icons-react';

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [colorMode, setColorMode] = useState<string | null>('normal');

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
          checked={reducedMotion}
          onChange={(e) => setReducedMotion(e.currentTarget.checked)}
          color="violet"
        />
        <Switch
          size="xs"
          label="Screen Reader Hints"
          checked={screenReader}
          onChange={(e) => setScreenReader(e.currentTarget.checked)}
          color="violet"
        />

        <Select
          size="xs"
          label="Color Vision"
          data={[
            { value: 'normal', label: 'Normal' },
            { value: 'protanopia', label: 'Protanopia' },
            { value: 'deuteranopia', label: 'Deuteranopia' },
            { value: 'tritanopia', label: 'Tritanopia' },
          ]}
          value={colorMode}
          onChange={setColorMode}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
      </Stack>
    </Paper>
  );
}
