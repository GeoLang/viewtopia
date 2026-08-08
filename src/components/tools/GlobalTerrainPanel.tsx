import { useEffect, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Select,
  Slider,
  Button,
  TextInput,
} from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';
import {
  createWorldTerrainAsync,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  type TerrainProvider,
} from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer, getActiveMapLibre } from '../../viewer/registry';
import { useAppStore, type Renderer } from '../../store/app';
import { addMapTerrain, TERRAIN_RGB_URL, type MapTerrain } from '../../lib/mapTerrain';

/**
 * The stack's own quantized-mesh terrain, served by tiletopia through the viewer's
 * /tiles proxy. Relative so it follows whatever host the viewer is served from.
 */
const STACK_TERRAIN_URL = '/tiles/v1/terrain/';

const NO_SOURCE =
  'No terrain source: the platform terrain service did not answer, terrain stays off';

/** What the renderer shows with terrain off; only Cesium has an ellipsoid. */
const offStatus = (renderer: Renderer) =>
  renderer === 'cesium' ? 'Ellipsoid (default)' : 'Terrain off';

export function GlobalTerrainPanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const onMap = renderer === 'maplibre';
  const [provider, setProvider] = useState<string | null>('stack');
  const [url, setUrl] = useState('');
  const [exaggeration, setExaggeration] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(() => offStatus(renderer));
  const [failed, setFailed] = useState(false);
  // NO_SOURCE names no cause, so the rejection behind it is kept and shown
  const [detail, setDetail] = useState<string | null>(null);
  const mapTerrainRef = useRef<MapTerrain | null>(null);

  // Vertical exaggeration is a scene setting: apply live, no provider needed.
  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (viewer) viewer.scene.verticalExaggeration = exaggeration;
    mapTerrainRef.current?.setExaggeration(exaggeration);
  }, [exaggeration]);

  // A renderer switch destroys the map, taking its relief with it, so the panel
  // drops back to its off state rather than claiming terrain that is gone.
  useEffect(() => {
    setStatus(offStatus(renderer));
    setFailed(false);
    setDetail(null);
    return () => {
      mapTerrainRef.current?.remove();
      mapTerrainRef.current = null;
    };
  }, [renderer]);

  const enableMapRelief = () => {
    mapTerrainRef.current?.remove();
    mapTerrainRef.current = addMapTerrain(exaggeration, () => {
      // a tile that will not load lands here, well after Enable returned
      setFailed(true);
      setStatus(NO_SOURCE);
    });
    if (!mapTerrainRef.current) {
      setFailed(true);
      setStatus('No active viewer');
      return;
    }
    setFailed(false);
    setStatus('Platform terrain enabled');
  };

  const enableTerrain = async () => {
    setDetail(null);
    if (onMap) {
      enableMapRelief();
      return;
    }
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      setFailed(true);
      return;
    }
    setLoading(true);
    try {
      let tp: TerrainProvider;
      if (provider === 'stack') tp = await CesiumTerrainProvider.fromUrl(STACK_TERRAIN_URL);
      else if (provider === 'custom') tp = await CesiumTerrainProvider.fromUrl(url);
      else tp = await createWorldTerrainAsync();
      viewer.terrainProvider = tp;
      setFailed(false);
      setStatus(
        provider === 'stack'
          ? 'Platform terrain enabled'
          : provider === 'custom'
            ? 'Custom terrain enabled'
            : 'Cesium World Terrain enabled',
      );
    } catch (e) {
      // the platform service may be unreachable or still require a token, a typed
      // URL may be wrong, and world terrain needs an Ion token: all land here
      // cesium's rejections carry the inner error on later lines, often as a bare
      // "undefined", so only the first line is fit to show
      const message = (e instanceof Error ? e.message : String(e)).split('\n')[0];
      console.error('Terrain provider failed', e);
      setFailed(true);
      setStatus(provider === 'stack' ? NO_SOURCE : `Terrain failed: ${message}`);
      // the other statuses already carry the message
      if (provider === 'stack') setDetail(message);
    } finally {
      setLoading(false);
    }
  };

  const resetTerrain = () => {
    setDetail(null);
    if (onMap) {
      if (!getActiveMapLibre()) {
        setStatus('No active viewer');
        setFailed(true);
        return;
      }
      mapTerrainRef.current?.remove();
      mapTerrainRef.current = null;
      setFailed(false);
      setStatus(offStatus(renderer));
      return;
    }
    const viewer = getActiveCesiumViewer();
    if (!viewer) {
      setStatus('No active viewer');
      setFailed(true);
      return;
    }
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    setFailed(false);
    setStatus(offStatus(renderer));
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconWorld size={16} />}
        title="Global Terrain"
        onClose={onClose}
      />

      <Stack gap="xs">
        {onMap ? (
          // MapLibre reads terrain-RGB tiles, so the quantized-mesh providers the
          // select offers have nothing to say here
          <Text size="xs" c="dimmed">
            {TERRAIN_RGB_URL}
          </Text>
        ) : (
          <>
            <Select
              size="xs"
              label="Provider"
              data={[
                { value: 'stack', label: 'Platform terrain' },
                { value: 'cesium', label: 'Cesium World Terrain' },
                { value: 'custom', label: 'Custom URL' },
              ]}
              value={provider}
              onChange={setProvider}
            />

            {provider === 'stack' && (
              <Text size="xs" c="dimmed">
                {STACK_TERRAIN_URL}
              </Text>
            )}

            {provider === 'custom' && (
              <TextInput
                size="xs"
                label="Terrain URL"
                placeholder="https://…/terrain"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
              />
            )}
          </>
        )}

        <Button
          size="xs"
          color="violet"
          onClick={enableTerrain}
          loading={loading}
          fullWidth
        >
          Enable Terrain
        </Button>

        <Text size="xs" c="dimmed">Exaggeration: {exaggeration.toFixed(1)}×</Text>
        <Slider size="xs" min={0.5} max={10} step={0.5} value={exaggeration} onChange={setExaggeration} color="violet" />

        <Button
          size="xs"
          variant="subtle"
          color="gray"
          onClick={resetTerrain}
          fullWidth
        >
          {onMap ? 'Disable Terrain' : 'Reset to Ellipsoid'}
        </Button>

        <Text size="xs" c={failed ? 'red' : 'green'} data-testid="terrain-status">{status}</Text>
        {detail && (
          <Text size="xs" c="dimmed" data-testid="terrain-error">
            {detail}
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
