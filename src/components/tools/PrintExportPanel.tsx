import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Select,
  NumberInput,
} from '@mantine/core';
import { IconFileExport, IconX } from '@tabler/icons-react';
import { useAppStore } from '../../store/app';

/** CSS reference resolution: at 96 DPI the requested pixels are the output pixels. */
const CSS_DPI = 96;

/** Chrome refuses to encode a canvas larger than this on a side. */
const MAX_SIDE = 8192;

/**
 * Output pixels for a width/height in CSS pixels at the requested DPI. Both sides
 * shrink by the same factor when the DPI would take one past MAX_SIDE, so the
 * aspect ratio survives the clamp.
 */
export function exportPixelSize(
  width: number,
  height: number,
  dpi: number,
): { width: number; height: number } {
  const scale = Math.max(dpi, 1) / CSS_DPI;
  const w = Math.max(1, width) * scale;
  const h = Math.max(1, height) * scale;
  const clamp = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { width: Math.round(w * clamp), height: Math.round(h * clamp) };
}

export function PrintExportPanel({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<string | null>('png');
  const [width, setWidth] = useState<number | string>(1920);
  const [height, setHeight] = useState<number | string>(1080);
  const [dpi, setDpi] = useState<number | string>(150);
  const [status, setStatus] = useState<string | null>(null);
  const renderer = useAppStore((s) => s.renderer);

  const output = exportPixelSize(Number(width) || 0, Number(height) || 0, Number(dpi) || 0);

  const handleExport = () => {
    setStatus(null);

    // Pick the container matching the active renderer
    const containerIds: Record<string, string> = {
      cesium: 'cesium-container',
      deckgl: 'deckgl-container',
      maplibre: 'maplibre-container',
    };
    const containerId = containerIds[renderer] ?? 'cesium-container';
    const container = document.getElementById(containerId);
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;

    if (!canvas) {
      setStatus('No canvas found — is the viewer loaded?');
      return;
    }

    try {
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      // The renderers are not re-rendered at the output size: the live frame is
      // scaled into it, so a larger export is the same view, not more detail.
      const out = document.createElement('canvas');
      out.width = output.width;
      out.height = output.height;
      const ctx = out.getContext('2d');
      if (!ctx) {
        setStatus('Export failed — no 2D context');
        return;
      }
      if (mimeType === 'image/jpeg') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      const dataUrl = out.toDataURL(mimeType);
      if (!dataUrl || dataUrl === 'data:,') {
        setStatus('Export returned empty image');
        return;
      }
      const link = document.createElement('a');
      link.download = `viewtopia-export.${format === 'jpg' ? 'jpg' : 'png'}`;
      link.href = dataUrl;
      link.click();
      setStatus('Exported!');
    } catch {
      setStatus('Export failed — canvas may be cross-origin tainted');
    }
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
        width: 260,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconFileExport size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Print / Export
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          size="xs"
          label="Format"
          data={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPEG' },
          ]}
          value={format}
          onChange={setFormat}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Group gap="xs" grow>
          <NumberInput size="xs" label="Width" value={width} onChange={setWidth}
            min={100} max={8000}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
          <NumberInput size="xs" label="Height" value={height} onChange={setHeight}
            min={100} max={8000}
            styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
          />
        </Group>

        <NumberInput size="xs" label="DPI" value={dpi} onChange={setDpi}
          min={72} max={600}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed" data-testid="printexport-size">
          Output: {output.width} × {output.height} px, scaled from the live view
        </Text>

        <Button size="xs" variant="filled" color="violet" onClick={handleExport} fullWidth>
          Export
        </Button>

        {status && (
          <Text size="xs" c={status === 'Exported!' ? 'green' : 'red'} ta="center">
            {status}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
