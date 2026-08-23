import { Alert, Button, Code, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import { useTilesetStore } from './store';
import { BROWSER_IMPORT_LIMIT_BYTES, formatBytes, tooLargeForBrowser } from './api';

/**
 * The offer to build a file into a server tileset instead of parsing it in the
 * tab, and the progress and failure that follow once it is taken. Mounted once,
 * because a file reaches it from the import panel and from a drop anywhere.
 */
export function TilesetOffer() {
  const offered = useTilesetStore((s) => s.offered);
  const uploadFraction = useTilesetStore((s) => s.uploadFraction);
  const building = useTilesetStore((s) => s.building);
  const buildError = useTilesetStore((s) => s.buildError);
  const browserFallback = useTilesetStore((s) => s.browserFallback);
  const build = useTilesetStore((s) => s.build);
  const dismiss = useTilesetStore((s) => s.dismissOffer);

  if (!offered) return null;
  const running = uploadFraction !== null || building !== null;
  const oversize = tooLargeForBrowser(offered);

  return (
    <Modal
      opened
      onClose={dismiss}
      title="Build a server tileset"
      centered
      closeOnClickOutside={!running}
    >
      <Stack gap="sm" data-testid="tileset-offer">
        <Text size="sm">
          {offered.name} — {formatBytes(offered.size)}
        </Text>
        <Text size="xs" c="dimmed">
          {oversize
            ? `Past the ${formatBytes(BROWSER_IMPORT_LIMIT_BYTES)} this browser holds comfortably. ` +
              'The server can tile it instead and the map draws the tiles.'
            : 'The server tiles the file and the map draws the tiles, rather than holding every feature in the tab.'}
        </Text>
        <Text size="xs" c="dimmed">
          A tileset is a snapshot: nothing rebuilds on its own, and the MapLibre
          renderer is the only one that draws it.
        </Text>

        {uploadFraction !== null && !building && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Uploading {Math.round(uploadFraction * 100)}%
            </Text>
            <Progress value={uploadFraction * 100} data-testid="tileset-upload-progress" />
          </Stack>
        )}

        {building && (
          <Text size="xs" c="dimmed" data-testid="tileset-build-status">
            {building.status === 'building'
              ? 'Building tiles, which takes minutes on a large file…'
              : `Build ${building.status}`}
          </Text>
        )}

        {buildError && (
          <Alert color="red" title="Build failed" data-testid="tileset-build-error">
            <Code block style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {buildError}
            </Code>
          </Alert>
        )}

        <Group justify="flex-end">
          {browserFallback && !running && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              data-testid="tileset-load-in-browser"
              onClick={() => {
                const load = browserFallback;
                dismiss();
                load();
              }}
            >
              Load in the browser anyway
            </Button>
          )}
          <Button size="xs" variant="subtle" color="gray" onClick={dismiss} disabled={running}>
            Cancel
          </Button>
          <Button
            size="xs"
            color="violet"
            loading={running}
            data-testid="tileset-build"
            onClick={() => void build()}
          >
            {buildError ? 'Try again' : 'Build tileset'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
