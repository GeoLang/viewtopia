import { useState } from 'react';
import { Text, Button, Stack, FileButton } from '@mantine/core';
import { IconFile } from '@tabler/icons-react';
import { ACCEPT_FORMATS, importFiles, type ImportStatus } from '../../lib/importFiles';

interface FileImportTabProps {
  onImport: (name: string, geojson: GeoJSON.FeatureCollection) => void;
}

export function FileImportTab({ onImport }: FileImportTabProps) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);

  const handleFiles = (files: File[]) => importFiles(files, onImport, setStatus);

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
