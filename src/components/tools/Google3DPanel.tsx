import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Paper, Text, Stack, Group, ActionIcon, TextInput, Switch } from '@mantine/core';
import { IconBrandGoogle, IconX } from '@tabler/icons-react';
import { Cesium3DTileset } from 'cesium';
import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';

const GOOGLE_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

export function Google3DPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [apiKey, setApiKey] = useState(() => useAppStore.getState().settings.googleMapsApiKey);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tileset = useRef<Cesium3DTileset | null>(null);

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  const disable = () => {
    if (tileset.current && viewer) viewer.scene.primitives.remove(tileset.current);
    tileset.current = null;
    setEnabled(false);
  };

  const enable = async () => {
    const key = apiKey.trim();
    if (!viewer || !key) return;
    setEnabled(true);
    setBusy(true);
    setError(null);
    try {
      // google's terms require the attribution credits to stay on screen
      const loaded = await Cesium3DTileset.fromUrl(
        `${GOOGLE_TILES_URL}?key=${encodeURIComponent(key)}`,
        { showCreditsOnScreen: true },
      );
      viewer.scene.primitives.add(loaded);
      tileset.current = loaded;
      useAppStore.getState().updateSettings({ googleMapsApiKey: key });
    } catch (e) {
      setEnabled(false);
      setError(`Google 3D Tiles failed to load: ${firstLine(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: ReactNode) => (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBrandGoogle size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Google 3D Tiles
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>
      {children}
    </Paper>
  );

  if (!viewer) {
    return shell(
      <Text size="xs" c="dimmed" data-testid="google3d-no-cesium">
        Google 3D Tiles needs the Cesium globe. Switch to the CesiumJS renderer.
      </Text>,
    );
  }

  return shell(
    <Stack gap="xs">
      <TextInput
        size="xs"
        label="Google Maps API Key"
        placeholder="Enter API key…"
        value={apiKey}
        onChange={(e) => setApiKey(e.currentTarget.value)}
        type="password"
        styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
      />

      <Switch
        size="xs"
        label="Enable Photorealistic 3D Tiles"
        checked={enabled}
        onChange={(e) => (e.currentTarget.checked ? void enable() : disable())}
        disabled={!apiKey.trim() || busy}
        color="violet"
      />

      {error && (
        <Text size="xs" c="red" data-testid="google3d-error">
          {error}
        </Text>
      )}

      <Text size="xs" c="dimmed">
        Loads Google's photorealistic 3D tiles as a Cesium tileset. Requires a valid Maps Platform
        API key, and keeps the Google attribution visible on the globe.
      </Text>
    </Stack>,
  );
}
