import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconBroadcast, IconLogout, IconShare } from '@tabler/icons-react';
import { useAuthStore } from '../features/auth/store';
import { agoraErrorText, createLiveDocument, listLiveDocuments } from './api';
import { captureStateForNewDocument } from './documentBridge';
import { LiveComments } from './LiveComments';
import { LivePeers } from './LivePeers';
import { LiveShareDialog } from './LiveShareDialog';
import { LiveUndo } from './LiveUndo';
import { useLiveStore } from './liveStore';
import type { LiveDocumentSummary } from './types';

export function LiveSessionControl() {
  const documentId = useLiveStore((s) => s.documentId);
  const documentName = useLiveStore((s) => s.document.meta.name);
  const connection = useLiveStore((s) => s.connection);
  const role = useLiveStore((s) => s.role);
  const connect = useLiveStore((s) => s.connect);
  const disconnect = useLiveStore((s) => s.disconnect);
  const signedIn = useAuthStore((s) => s.token) !== null;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState('');
  const [documents, setDocuments] = useState<LiveDocumentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openPicker = () => {
    setPickerOpen(true);
    setError('');
    setBusy(true);
    listLiveDocuments()
      .then(setDocuments)
      .catch((failure: unknown) => {
        setError(agoraErrorText(failure, 'Could not load your live maps.'));
      })
      .finally(() => setBusy(false));
  };

  const startSession = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await createLiveDocument(name.trim() || 'Untitled live map');
      // the document starts from what this browser already has on screen
      captureStateForNewDocument();
      connect({ documentId: created.id });
      setPickerOpen(false);
      setName('');
    } catch (failure) {
      setError(agoraErrorText(failure, 'Could not start the session.'));
    } finally {
      setBusy(false);
    }
  };

  if (documentId) {
    return (
      <Group gap="xs" wrap="nowrap" data-testid="live-session">
        <Badge
          size="xs"
          variant="dot"
          color={connection === 'open' ? 'green' : 'yellow'}
          data-testid="live-document-name"
        >
          {documentName || 'Live map'}
        </Badge>
        {role === 'view' && (
          <Badge size="xs" variant="light" color="gray">
            view only
          </Badge>
        )}
        <LivePeers />
        <LiveComments />
        <LiveUndo />
        <Tooltip label="Share this live map">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="violet"
            aria-label="Share this live map"
            onClick={() => setShareOpen(true)}
          >
            <IconShare size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Leave the live map">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Leave the live map"
            onClick={disconnect}
          >
            <IconLogout size={14} />
          </ActionIcon>
        </Tooltip>
        <LiveShareDialog
          documentId={documentId}
          opened={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      </Group>
    );
  }

  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        color="violet"
        leftSection={<IconBroadcast size={14} />}
        onClick={openPicker}
      >
        Live
      </Button>
      <Modal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Live map session"
        size="md"
      >
        <Stack gap="sm">
          {!signedIn && (
            <Text size="xs" c="orange">
              Sign in to start or join a live map.
            </Text>
          )}
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              flex={1}
              placeholder="New live map name…"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <Button
              size="xs"
              color="violet"
              disabled={!signedIn}
              onClick={() => void startSession()}
              data-testid="start-live-session"
            >
              Start
            </Button>
          </Group>

          {busy && <Loader size="xs" />}
          {documents.map((document) => (
            <Group key={document.id} justify="space-between" wrap="nowrap">
              <Text size="xs" c="white" truncate>
                {document.name}
              </Text>
              <Button
                size="xs"
                variant="light"
                color="violet"
                onClick={() => {
                  connect({ documentId: document.id });
                  setPickerOpen(false);
                }}
              >
                Join
              </Button>
            </Group>
          ))}
          {!busy && documents.length === 0 && (
            <Text size="xs" c="dimmed">
              No live maps yet.
            </Text>
          )}
          {error && (
            <Text size="xs" c="red" data-testid="live-error">
              {error}
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
