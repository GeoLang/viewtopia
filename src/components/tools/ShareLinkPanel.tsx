import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  CopyButton,
} from '@mantine/core';
import { IconLink, IconX, IconCopy, IconCheck } from '@tabler/icons-react';
import { useAppStore } from '../../store/app';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { captureCameraState } from '../../store/cameraViews';

export function ShareLinkPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [shareUrl, setShareUrl] = useState('');

  const generateLink = () => {
    const viewer = getActiveCesiumViewer();
    const cam = viewer ? captureCameraState(viewer) : null;
    const shared = getSharedCamera();
    const lng = cam?.lng ?? shared.longitude;
    const lat = cam?.lat ?? shared.latitude;
    const height = cam?.height ?? 4e7 / Math.pow(2, shared.zoom);
    const heading = cam?.heading ?? shared.bearing;
    const pitch = cam?.pitch ?? shared.pitch - 90;

    const params = new URLSearchParams();
    params.set('cam', [lng, lat, height, heading, pitch].map((n) => n.toFixed(5)).join(','));
    params.set('renderer', renderer);
    const url = `${window.location.origin}${window.location.pathname}#${params}`;
    setShareUrl(url);
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
        width: 340,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconLink size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Share Link
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Generate a URL that restores the current camera and active renderer.
        </Text>

        <Button size="xs" variant="filled" color="violet" onClick={generateLink} fullWidth>
          Generate Share Link
        </Button>

        {shareUrl && (
          <Group gap="xs">
            <TextInput
              size="xs"
              flex={1}
              value={shareUrl}
              readOnly
              data-testid="sharelink-url"
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <CopyButton value={shareUrl}>
              {({ copied, copy }) => (
                <ActionIcon size="sm" variant="filled" color={copied ? 'green' : 'violet'} onClick={copy} aria-label="Copy link">
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
