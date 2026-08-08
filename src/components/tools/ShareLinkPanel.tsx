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
import { useAppStore, type Renderer } from '../../store/app';
import { getActiveCesiumViewer, getActiveMapLibre } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { captureCameraState } from '../../store/cameraViews';

/**
 * The five hash numbers (lng, lat, height, heading, pitch) read off the renderer
 * that is on screen. Cesium pitch convention: 0 = horizon, -90 = straight down.
 */
function activeCamera(renderer: Renderer): number[] {
  if (renderer === 'cesium') {
    const viewer = getActiveCesiumViewer();
    const cam = viewer ? captureCameraState(viewer) : null;
    if (cam) return [cam.lng, cam.lat, cam.height, cam.heading, cam.pitch];
  }
  if (renderer === 'maplibre') {
    const map = getActiveMapLibre();
    if (map) {
      const c = map.getCenter();
      return [
        c.lng,
        c.lat,
        4e7 / 2 ** map.getZoom(),
        map.getBearing(),
        map.getPitch() - 90,
      ];
    }
  }
  const shared = getSharedCamera();
  return [
    shared.longitude,
    shared.latitude,
    4e7 / 2 ** shared.zoom,
    shared.bearing,
    shared.pitch - 90,
  ];
}

export function ShareLinkPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [shareUrl, setShareUrl] = useState('');

  const generateLink = () => {
    const params = new URLSearchParams();
    params.set('cam', activeCamera(renderer).map((n) => n.toFixed(5)).join(','));
    params.set('renderer', renderer);
    const url = `${window.location.origin}${window.location.pathname}#${params}`;
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
