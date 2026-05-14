import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Select,
  Switch,
} from '@mantine/core';
import { IconDeviceVisionPro, IconX } from '@tabler/icons-react';

export function WebXRPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<string | null>('vr');
  const [trackingEnabled, setTrackingEnabled] = useState(true);

  const handleEnter = () => {
    const xr = (navigator as unknown as Record<string, unknown>).xr as { isSessionSupported?: (mode: string) => Promise<boolean> } | undefined;
    if (xr?.isSessionSupported) {
      xr.isSessionSupported(mode === 'ar' ? 'immersive-ar' : 'immersive-vr')
        .then((supported: boolean) => {
          if (!supported) {
            alert(`${mode?.toUpperCase()} not supported on this device`);
          }
        })
        .catch(() => {});
    } else {
      alert('WebXR not supported in this browser');
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
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconDeviceVisionPro size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            WebXR (VR/AR)
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Mode"
          data={[
            { value: 'vr', label: '🥽 Virtual Reality' },
            { value: 'ar', label: '📱 Augmented Reality' },
          ]}
          value={mode}
          onChange={setMode}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Switch
          size="xs"
          label="Hand/Controller Tracking"
          checked={trackingEnabled}
          onChange={(e) => setTrackingEnabled(e.currentTarget.checked)}
          color="violet"
        />

        <Button size="xs" variant="filled" color="violet" onClick={handleEnter} fullWidth>
          Enter {mode?.toUpperCase()} Mode
        </Button>
      </Stack>
    </Paper>
  );
}
