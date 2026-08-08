import {
  Text,
  Stack,
  Switch,
} from '@mantine/core';
import { IconAccessible } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAccessibilityStore } from '../../store/accessibility';

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const largeText = useAccessibilityStore((s) => s.largeText);
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const setHighContrast = useAccessibilityStore((s) => s.setHighContrast);
  const setLargeText = useAccessibilityStore((s) => s.setLargeText);
  const setReduceMotion = useAccessibilityStore((s) => s.setReduceMotion);

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconAccessible size={16} />}
        title="Accessibility"
        onClose={onClose}
      />

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
    </PanelCard>
  );
}
