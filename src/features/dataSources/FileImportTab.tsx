import { useState } from 'react';
import { Text, Button, Stack, FileButton } from '@mantine/core';
import { IconFile } from '@tabler/icons-react';
import { ACCEPT_FORMATS, importFiles, type ImportStatus } from '../../lib/importFiles';
import {
  BROWSER_IMPORT_LIMIT_BYTES,
  TILESET_FORMATS,
  formatBytes,
  tilesetFormat,
} from '../tilesets/api';
import { useTilesetStore } from '../tilesets/store';

interface FileImportTabProps {
  onImport: (name: string, geojson: GeoJSON.FeatureCollection) => void;
}

export function FileImportTab({ onImport }: FileImportTabProps) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  // the last imported file the server could tile instead, so the offer can be
  // made a second time without asking for the file again
  const [candidate, setCandidate] = useState<File | null>(null);
  const offerTileset = useTilesetStore((s) => s.offer);

  const handleFiles = (files: File[]) => {
    setCandidate(files.find((file) => tilesetFormat(file.name)) ?? null);
    return importFiles(files, onImport, setStatus);
  };

  return (
    <>
      <Stack
        align="center"
        justify="center"
        p="xl"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles([...e.dataTransfer.files]);
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--mantine-color-violet-4)' : 'var(--mantine-color-dark-5)'}`,
          borderRadius: 8,
          background: 'var(--mantine-color-dark-8)',
        }}
      >
        <IconFile size={32} style={{ color: 'var(--mantine-color-dark-4)' }} />
        <Text size="sm" c="dimmed" ta="center">
          Drop files here or click Browse
        </Text>
        <Text size="xs" c="dimmed">
          {ACCEPT_FORMATS.join(', ')}
        </Text>
        <FileButton
          onChange={(files) => files && void handleFiles(Array.isArray(files) ? files : [files])}
          accept={ACCEPT_FORMATS.join(',')}
          multiple
        >
          {(props) => (
            <Button size="xs" color="violet" {...props}>
              Browse Files
            </Button>
          )}
        </FileButton>
      </Stack>

      {candidate && (
        <Stack gap={4} mt="xs" align="center">
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            data-testid="build-tileset"
            onClick={() => offerTileset(candidate)}
          >
            Build a server tileset from {candidate.name}
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            Tiled on the server and drawn by the MapLibre renderer only. A{' '}
            {TILESET_FORMATS.join(', ')} file over {formatBytes(BROWSER_IMPORT_LIMIT_BYTES)} is
            offered this on import.
          </Text>
        </Stack>
      )}

      {status && (
        <Text
          size="xs"
          mt="xs"
          ta="center"
          c={status.failed ? 'red' : 'green'}
          data-testid="import-status"
        >
          {status.text}
        </Text>
      )}
    </>
  );
}
