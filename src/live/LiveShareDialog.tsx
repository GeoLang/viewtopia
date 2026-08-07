import { useState } from 'react';
import {
  Button,
  CopyButton,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { createShareLink, shareLinkUrl } from './api';
import type { LiveRole } from './types';

export function LiveShareDialog({
  documentId,
  opened,
  onClose,
}: {
  documentId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState<LiveRole>('view');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const { token } = await createShareLink(documentId, role);
      setLink(shareLinkUrl(token));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'could not create the link');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Share this live map" size="md">
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          value={role}
          onChange={(next) => {
            setRole(next as LiveRole);
            setLink('');
          }}
          data={[
            { value: 'view', label: 'Can view' },
            { value: 'edit', label: 'Can edit' },
          ]}
        />
        <Button
          size="xs"
          color="violet"
          loading={creating}
          onClick={() => void create()}
          data-testid="create-share-link"
        >
          Create link
        </Button>
        {link && (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              flex={1}
              readOnly
              value={link}
              data-testid="share-link"
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Button size="xs" variant="light" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
        )}
        {error && (
          <Text size="xs" c="red" data-testid="share-error">
            {error}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Anyone with the link joins this document. View links cannot edit.
        </Text>
      </Stack>
    </Modal>
  );
}
