/**
 * ConvertPanel — write a loaded layer out as a cloud-native file, in the
 * browser. The formats and their writers are in formats.ts; this panel only
 * picks a layer, calls the writer and hands the bytes to a download.
 */
import { useState } from 'react';
import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconDownload, IconTransform } from '@tabler/icons-react';
import { PanelCard, PanelCloseButton } from '../../components/PanelCard';
import { CONVERT_FORMATS, convertFileName, convertLayer, type ConvertFormat } from './formats';
import { useGeoJsonSources } from '../../lib/geojsonSources';
import { downloadBytes } from '../../lib/downloadBytes';

export function ConvertPanel({ onClose }: { onClose: () => void }) {
  const sources = useGeoJsonSources();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [format, setFormat] = useState<ConvertFormat>('geoparquet');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [written, setWritten] = useState<{ fileName: string; bytes: number } | null>(null);

  const source = sources.find((s) => s.id === sourceId);
  const spec = CONVERT_FORMATS.find((f) => f.id === format);

  async function handleConvert() {
    if (!source || !spec) return;
    setRunning(true);
    setError(null);
    setWritten(null);
    try {
      const bytes = await convertLayer(source.geojson, source.name, format);
      const fileName = convertFileName(source.name, format);
      downloadBytes(bytes, fileName, spec.mimeType);
      setWritten({ fileName, bytes: bytes.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the conversion failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <PanelCard width={320}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconTransform size={16} color="#38bdf8" />
          <Text size="sm" fw={600} c="white">
            Convert
          </Text>
        </Group>
        <PanelCloseButton onClose={onClose} />
      </Group>

      <Stack gap="xs">
        {sources.length === 0 && (
          <Text size="xs" c="dimmed">
            Draw or load features first — there is nothing to convert yet.
          </Text>
        )}

        <Select
          label="Layer"
          size="xs"
          data={sources.map((s) => ({ value: s.id, label: s.name }))}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            setError(null);
            setWritten(null);
          }}
          placeholder="pick a layer"
        />

        <Select
          label="Format"
          size="xs"
          data={CONVERT_FORMATS.map(({ id, label }) => ({ value: id, label }))}
          value={format}
          onChange={(v) => {
            setFormat((v as ConvertFormat) ?? 'geoparquet');
            setError(null);
            setWritten(null);
          }}
        />

        {source && (
          <Text size="xs" c="dimmed">
            {source.geojson.features.length} features
          </Text>
        )}

        <Button
          size="xs"
          leftSection={<IconDownload size={14} />}
          onClick={handleConvert}
          loading={running}
          disabled={!source}
        >
          Convert and download
        </Button>

        {error && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {written && (
          <Text size="xs" c="teal" data-testid="convert-result">
            {written.fileName}: {written.bytes} bytes
          </Text>
        )}
      </Stack>
    </PanelCard>
  );
}
