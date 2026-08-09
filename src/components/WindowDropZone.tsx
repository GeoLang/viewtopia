import { useEffect, useRef, useState } from 'react';
import { Loader, Stack, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { importFiles } from '../lib/importFiles';
import { useAgentLayerStore } from '../store/agentLayers';

/**
 * Full-window drop target: dragging files anywhere over the app raises the
 * affordance and drops route through the same import paths as the Import
 * panel. Drag state uses an enter/leave counter because the browser fires a
 * leave for every child boundary crossed.
 */
export function WindowDropZone() {
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(0);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      // a zone below (the Import panel) already claimed and imported this drop
      if (e.defaultPrevented) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      setImporting(files.length);
      const addLayer = useAgentLayerStore.getState().addLayer;
      void importFiles(files, (name, geojson) =>
        addLayer({ id: crypto.randomUUID(), name, color: '#38bdf8', geojson }),
      ).finally(() => setImporting(0));
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging && !importing) return null;

  return (
    <Stack
      align="center"
      justify="center"
      gap="xs"
      data-testid="window-drop-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(13, 17, 23, 0.8)',
        border: '2px dashed var(--mantine-color-violet-4)',
        pointerEvents: importing ? 'auto' : 'none',
      }}
    >
      {importing ? (
        <>
          <Loader color="violet" />
          <Text c="white" fw={600}>
            Importing {importing} file{importing === 1 ? '' : 's'}…
          </Text>
        </>
      ) : (
        <>
          <IconUpload size={40} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text c="white" fw={600}>
            Drop files to import
          </Text>
          <Text size="xs" c="dimmed">
            GeoJSON, KML, GPX, CSV, GeoPackage, Shapefile, FlatGeobuf, Parquet, PMTiles,
            images and PDFs
          </Text>
        </>
      )}
    </Stack>
  );
}
