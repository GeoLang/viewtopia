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
import {
  OVERLAY_ACCEPT,
  imageCorners,
  overlayFileKind,
  parseWorldFile,
} from './worldFile';
import {
  bboxFromTwoClicks,
  bboxOfCorners,
  cameraForBbox,
  cornersAxisAligned,
  type LonLatBbox,
} from './georeference';
import { cornersToLonLat } from './projicio';
import { resampleNorthUp } from './rasterize';
import { renderPdfPage } from './pdf';

interface OverlaySource {
  name: string;
  dataUrl: string;
  element: CanvasImageSource;
  width: number;
  height: number;
  pdfFile?: File;
  pageCount?: number;
  page?: number;
}

interface OverlayPlacement {
  url: string;
  bbox: LonLatBbox;
  kind: 'worldFile' | 'manual';
}

type CornerPicking = 'off' | 'first' | 'second';

const DEFAULT_OVERLAY_OPACITY = 0.8;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function loadImageSource(file: File): Promise<OverlaySource> {
  const dataUrl = await readAsDataUrl(file);
  const element = new Image();
  element.src = dataUrl;
  await element.decode();
  return {
    name: file.name,
    dataUrl,
    element,
    width: element.naturalWidth,
    height: element.naturalHeight,
  };
}

async function loadPdfSource(file: File, page: number): Promise<OverlaySource> {
  // a fresh buffer per render: pdfjs transfers the one it is given to its worker
  const { canvas, pageCount } = await renderPdfPage(await file.arrayBuffer(), page);
  return {
    name: file.name,
    dataUrl: canvas.toDataURL('image/png'),
    element: canvas,
    width: canvas.width,
    height: canvas.height,
    pdfFile: file,
    pageCount,
    page,
  };
}

export function ImageOverlayPanel({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<OverlaySource | null>(null);
  const [worldFileText, setWorldFileText] = useState<string | null>(null);
  const [projectionText, setProjectionText] = useState<string | null>(null);
  const [placement, setPlacement] = useState<OverlayPlacement | null>(null);
  const [opacity, setOpacity] = useState(DEFAULT_OVERLAY_OPACITY);
  const [picking, setPicking] = useState<CornerPicking>('off');
  const [firstCorner, setFirstCorner] = useState<{ lng: number; lat: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const layerId = useRef(crypto.randomUUID());
  const kept = useRef(false);
  const addRasterLayer = useAgentLayerStore((s) => s.addRasterLayer);
  const flyTo = useSpaceTimeStore((s) => s.flyTo);

  useEffect(() => {
    return () => {
      if (!kept.current) useAgentLayerStore.getState().removeRasterLayer(layerId.current);
    };
  }, []);

  const showPlacement = (next: OverlayPlacement, name: string, fly: boolean) => {
    setPlacement(next);
    setError(null);
    addRasterLayer({ id: layerId.current, name, url: next.url, bbox: next.bbox, opacity });
    if (fly) {
      const camera = cameraForBbox(next.bbox);
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
      const next: OverlayPlacement = cornersAxisAligned(corners)
        ? { url: source.dataUrl, bbox: bboxOfCorners(corners), kind: 'worldFile' }
        : { ...resampleNorthUp(source.element, source.width, source.height, corners), kind: 'worldFile' };
      showPlacement(next, source.name, true);
    };
    apply().catch((err) => {
      if (!stale) setError(err instanceof Error ? err.message : 'georeferencing failed');
    });
    return () => {
      stale = true;
    };
  }, [source, worldFileText, projectionText]);

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
      showPlacement({ url: source.dataUrl, bbox, kind: 'manual' }, source.name, false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [picking, source, firstCorner]);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      let nextWorldFile = worldFileText;
      for (const file of files) {
        switch (overlayFileKind(file.name)) {
          case 'image':
            setSource(await loadImageSource(file));
            break;
          case 'pdf':
            setSource(await loadPdfSource(file, 1));
            break;
          case 'worldFile':
            nextWorldFile = await file.text();
            setWorldFileText(nextWorldFile);
            break;
          case 'projection':
            setProjectionText(await file.text());
            break;
          default:
            setError(`${file.name}: not an image, PDF, world file or .prj`);
        }
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
      if (placement?.kind === 'manual') {
        showPlacement({ ...placement, url: next.dataUrl }, next.name, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'page render failed');
    } finally {
      setBusy(false);
    }
  };

  const editBbox = (index: number, value: number | string) => {
    if (!placement || typeof value !== 'number' || !Number.isFinite(value)) return;
    const bbox = [...placement.bbox] as LonLatBbox;
    bbox[index] = value;
    if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return;
    showPlacement({ ...placement, bbox }, source?.name ?? 'overlay', false);
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
            Drop a plan image or PDF here, with its world file and .prj if you have them
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

        {placement && (
          <>
            <Group gap="xs" grow>
              {bboxFields.map((field) => (
                <NumberInput
                  key={field.label}
                  label={field.label}
                  size="xs"
                  hideControls
                  decimalScale={6}
                  value={placement.bbox[field.index]}
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
