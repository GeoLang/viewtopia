import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  CopyButton,
} from '@mantine/core';
import { IconLink, IconCopy, IconCheck } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAppStore } from '../../store/app';
import { cameraHashFragment } from '../../hooks/useShareLinkHash';

export function ShareLinkPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [shareUrl, setShareUrl] = useState('');

  const generateLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${cameraHashFragment(renderer)}`;
    setShareUrl(url);
  };

  return (
    <PanelCard width={340}>
      <PanelHeader
        icon={<IconLink size={16} />}
        title="Share Link"
        onClose={onClose}
      />

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
    </PanelCard>
  );
}
