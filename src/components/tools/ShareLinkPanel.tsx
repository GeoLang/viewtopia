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
  Badge,
} from '@mantine/core';
import { IconLink, IconX, IconCopy, IconCheck } from '@tabler/icons-react';

export function ShareLinkPanel({ onClose }: { onClose: () => void }) {
  const [shareUrl, setShareUrl] = useState('');

  const generateLink = () => {
    const params = new URLSearchParams();
    params.set('t', Date.now().toString(36));
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
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
          Generate a shareable URL that captures the current map view, layers, and settings.
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
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <CopyButton value={shareUrl}>
              {({ copied, copy }) => (
                <ActionIcon size="sm" variant="filled" color={copied ? 'green' : 'violet'} onClick={copy}>
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
