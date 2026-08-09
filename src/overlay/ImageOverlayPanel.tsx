import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  NumberInput,
  Paper,
  Slider,
  Stack,
  Text,
} from '@mantine/core';
import { IconMapPin, IconPhotoPlus, IconX } from '@tabler/icons-react';
import { useAgentLayerStore } from '../store/agentLayers';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { clickCoordinates } from '../lib/mapClickCoordinates';
import { OVERLAY_ACCEPT, imageCorners, overlayFileKind, parseWorldFile } from './worldFile';
import {
  bboxFromTwoClicks,
  bboxOfCorners,
  cameraForBbox,
  cornersAxisAligned,
  cornersOfBbox,
  type Corners,
  type LonLatBbox,
} from './georeference';
import { cornersToLonLat, registerDroppedGrid } from './projicio';
import { resampleNorthUp } from './rasterize';
import {
  DEFAULT_OVERLAY_OPACITY,
  centerCorners,
  loadOverlaySource,
  loadPdfSource,
  type OverlaySource,
} from './importOverlay';

interface OverlayPlacement {
  url: string;
  corners: Corners;
}

type CornerPicking = 'off' | 'first' | 'second';

export function ImageOverlayPanel({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<OverlaySource | null>(null);
  const [worldFileText, setWorldFileText] = useState<string | null>(null);
  const [projectionText, setProjectionText] = useState<string | null>(null);
  const [gridNames, setGridNames] = useState<string[]>([]);
  const [placement, setPlacement] = useState<OverlayPlacement | null>(null);
  const [opacity, setOpacity] = useState(DEFAULT_OVERLAY_OPACITY);
  const [picking, setPicking] = useState<CornerPicking>('off');
  const [firstCorner, setFirstCorner] = useState<{ lng: number; lat: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const layerId = useRef(crypto.randomUUID());
  const kept = useRef(false);
  const addRasterLayer = useAgentLayerStore((s) => s.addRasterLayer);
  const setEditingRaster = useAgentLayerStore((s) => s.setEditingRaster);
  const editedCorners = useAgentLayerStore(
    (s) => s.rasterLayers.find((l) => l.id === layerId.current)?.corners,
  );
  const flyTo = useSpaceTimeStore((s) => s.flyTo);

  useEffect(() => {
    return () => {
      if (!kept.current) {
        useAgentLayerStore.getState().removeRasterLayer(layerId.current);
      }
      useAgentLayerStore.getState().setEditingRaster(null);
    };
  }, []);

  const showPlacement = (next: OverlayPlacement, name: string, fly: boolean) => {
    setPlacement(next);
    setError(null);
    addRasterLayer({
      id: layerId.current,
      name,
      url: next.url,
      corners: next.corners,
      opacity,
      visible: true,
    });
    setEditingRaster(layerId.current);
    if (fly) {
      const camera = cameraForBbox(bboxOfCorners(next.corners));
      flyTo(camera.lng, camera.lat, camera.zoom);
    }
  };

  // a world file placement follows from its inputs, so it reapplies whenever
  // the image, the page or a sidecar changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: showPlacement reads only current state
  useEffect(() => {
    if (!source || !worldFileText) return;
    let stale = false;
    const apply = async () => {
      const transform = parseWorldFile(worldFileText);
      const corners = await cornersToLonLat(
        imageCorners(transform, source.width, source.height),
        projectionText,
      );
      if (stale) return;
      // a rotated world file is resampled north-up so Cesium and Leaflet, which
      // drape onto a rectangle, show it in the right place too
      const next: OverlayPlacement = cornersAxisAligned(corners)
        ? { url: source.dataUrl, corners }
        : (() => {
            const flat = resampleNorthUp(
              source.element,
              source.width,
              source.height,
              corners,
            );
            return { url: flat.url, corners: cornersOfBbox(flat.bbox) };
          })();
      showPlacement(next, source.name, true);
    };
    apply().catch((err) => {
      if (!stale) setError(err instanceof Error ? err.message : 'georeferencing failed');
    });
    return () => {
      stale = true;
    };
  }, [source, worldFileText, projectionText, gridNames]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: showPlacement reads only current state
  useEffect(() => {
    if (picking === 'off' || !source) return;
    const onClick = (event: MouseEvent) => {
      const coordinates = clickCoordinates(event);
      if (!coordinates) return;
      if (picking === 'first' || !firstCorner) {
        setFirstCorner(coordinates);
        setPicking('second');
        return;
      }
      const bbox = bboxFromTwoClicks(firstCorner, coordinates, source.width, source.height);
      if (!bbox) return;
      setPicking('off');
      showPlacement({ url: source.dataUrl, corners: cornersOfBbox(bbox) }, source.name, false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [picking, source, firstCorner]);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      let nextSource: OverlaySource | undefined;
      let nextWorldFile: string | undefined;
      let nextProjection: string | undefined;
      const nextGrids: string[] = [];
      for (const file of files) {
        switch (overlayFileKind(file.name)) {
          case 'image':
          case 'pdf':
            nextSource = (await loadOverlaySource(file)) ?? undefined;
            break;
          case 'worldFile':
            nextWorldFile = await file.text();
            break;
          case 'projection':
            nextProjection = await file.text();
            break;
          case 'grid':
            await registerDroppedGrid(file.name, new Uint8Array(await file.arrayBuffer()));
            nextGrids.push(file.name);
            break;
          default:
            setError(`${file.name}: not an image, PDF, world file, .prj or .gsb`);
        }
      }
      // set together, so the placement effect never runs on a world file whose
      // .prj is still in this batch and shows a false not-lon/lat error
      if (nextSource) setSource(nextSource);
      if (nextWorldFile !== undefined) setWorldFileText(nextWorldFile);
      if (nextProjection !== undefined) setProjectionText(nextProjection);
      if (nextGrids.length > 0) setGridNames((registered) => [...registered, ...nextGrids]);

      // an image with no world file means nothing until it is on the map, so
      // drop it in the middle of the view and let the corner handles do the rest
      const georeferenced = nextWorldFile !== undefined || worldFileText !== null;
      if (nextSource && !georeferenced) {
        showPlacement(
          { url: nextSource.dataUrl, corners: centerCorners(nextSource) },
          nextSource.name,
          false,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed');
    } finally {
      setBusy(false);
    }
  };

  const changePage = async (page: number) => {
    if (!source?.pdfFile) return;
    setBusy(true);
    try {
      const next = await loadPdfSource(source.pdfFile, page);
      setSource(next);
      if (placement && !worldFileText) {
        showPlacement({ ...placement, url: next.dataUrl }, next.name, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'page render failed');
    } finally {
      setBusy(false);
    }
  };

  // the fields hold the envelope, so editing one re-squares a quad the user
  // dragged out of shape, which is the only way back from a bad drag
  const shownBbox = editedCorners ? bboxOfCorners(editedCorners) : null;

  const editBbox = (index: number, value: number | string) => {
    if (!placement || !shownBbox || typeof value !== 'number' || !Number.isFinite(value)) return;
    const bbox = [...shownBbox] as LonLatBbox;
    bbox[index] = value;
    if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return;
    showPlacement(
      { ...placement, corners: cornersOfBbox(bbox) },
      source?.name ?? 'overlay',
      false,
    );
  };

  const changeOpacity = (value: number) => {
    setOpacity(value);
    if (placement) useAgentLayerStore.getState().setRasterOpacity(layerId.current, value);
  };

  const keepLayer = () => {
    kept.current = true;
    onClose();
  };

  const bboxFields: { label: string; index: number }[] = [
    { label: 'West', index: 0 },
    { label: 'South', index: 1 },
    { label: 'East', index: 2 },
    { label: 'North', index: 3 },
  ];

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="md"
      style={{
        position: 'absolute',
        top: 60,
        right: 12,
        width: 340,
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 400,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconPhotoPlus size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Image Overlay
          </Text>
        </Group>
        <ActionIcon aria-label="Close image overlay" size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="sm">
        <Stack
          align="center"
          gap={4}
          p="md"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles([...e.dataTransfer.files]);
          }}
          style={{
            border: '2px dashed var(--mantine-color-dark-5)',
            borderRadius: 8,
            background: 'var(--mantine-color-dark-8)',
          }}
        >
          <Text size="xs" c="dimmed" ta="center">
            Drop a plan image or PDF here, with its world file, .prj and .gsb datum grid if you
            have them
          </Text>
          <FileButton onChange={(files) => files && void handleFiles(files)} accept={OVERLAY_ACCEPT.join(',')} multiple>
            {(props) => (
              <Button size="xs" color="violet" loading={busy} {...props}>
                Browse Files
              </Button>
            )}
          </FileButton>
        </Stack>

        {source && (
          <Text size="xs" c="dimmed" data-testid="overlay-source">
            {source.name} · {source.width}×{source.height}
            {worldFileText ? ' · world file' : ''}
            {projectionText ? ' · .prj' : ''}
            {gridNames.length > 0 ? ' · datum grid' : ''}
          </Text>
        )}

        {source?.pageCount != null && source.pageCount > 1 && (
          <NumberInput
            label={`PDF page (of ${source.pageCount})`}
            size="xs"
            min={1}
            max={source.pageCount}
            value={source.page}
            onChange={(value) => typeof value === 'number' && void changePage(value)}
          />
        )}

        {source && (
          <Button
            size="xs"
            variant={picking === 'off' ? 'light' : 'filled'}
            color="violet"
            leftSection={<IconMapPin size={14} />}
            data-testid="overlay-place"
            onClick={() => {
              if (picking === 'off') {
                setFirstCorner(null);
                setPicking('first');
              } else {
                setPicking('off');
              }
            }}
          >
            {picking === 'off'
              ? 'Place by two clicks'
              : picking === 'first'
                ? 'Click the north-west corner…'
                : 'Click the south-east corner…'}
          </Button>
        )}

        {placement && shownBbox && (
          <>
            <Text size="xs" c="dimmed">
              Drag the corner handles on the map to line the image up.
            </Text>
            <Group gap="xs" grow>
              {bboxFields.map((field) => (
                <NumberInput
                  key={field.label}
                  label={field.label}
                  size="xs"
                  hideControls
                  decimalScale={6}
                  value={shownBbox[field.index]}
                  onChange={(value) => editBbox(field.index, value)}
                  data-testid={`overlay-${field.label.toLowerCase()}`}
                />
              ))}
            </Group>
            <div>
              <Text size="xs" c="dimmed">
                Opacity
              </Text>
              <Slider size="xs" min={0.1} max={1} step={0.05} value={opacity} onChange={changeOpacity} />
            </div>
            <Button size="xs" color="violet" onClick={keepLayer} data-testid="overlay-keep">
              Keep layer
            </Button>
          </>
        )}

        {error && (
          <Text size="xs" c="red" data-testid="overlay-error">
            {error}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
