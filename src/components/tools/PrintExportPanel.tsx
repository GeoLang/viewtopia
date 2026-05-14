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

export function PrintExportPanel({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<string | null>('png');
  const [width, setWidth] = useState<number | string>(1920);
  const [height, setHeight] = useState<number | string>(1080);
  const [dpi, setDpi] = useState<number | string>(150);
  const [status, setStatus] = useState<string | null>(null);
  const renderer = useAppStore((s) => s.renderer);

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
      const dataUrl = canvas.toDataURL(mimeType);
      if (!dataUrl || dataUrl === 'data:,') {
        setStatus('Export returned empty image');
        return;
      }
      const link = document.createElement('a');
      link.download = `viewtopia-export.${format === 'jpg' ? 'jpg' : 'png'}`;
      link.href = dataUrl;
      link.click();
      setStatus('Exported!');
    } catch (e) {
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
            { value: 'pdf', label: 'PDF' },
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
