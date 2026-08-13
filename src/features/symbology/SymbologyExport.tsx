import { Button, Group } from '@mantine/core';
import { IconFileDownload } from '@tabler/icons-react';
import type { AgentLayer } from '../../store/agentLayers';
import { symbologyToMapboxStyle } from './mapboxStyle';
import { symbologyToSld } from './sldExport';

function download(text: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const fileStem = (name: string) => name.trim().replace(/[^\w.-]+/g, '-').toLowerCase() || 'layer';

/** Save this layer's classes as a file another GIS reads. */
export function SymbologyExport({ layer }: { layer: AgentLayer }) {
  const save = (contents: string | null, extension: string, mimeType: string) => {
    if (contents) download(contents, `${fileStem(layer.name)}.${extension}`, mimeType);
  };

  return (
    <Group gap={4} wrap="nowrap">
      <Button
        size="compact-xs"
        variant="subtle"
        disabled={!layer.symbology}
        leftSection={<IconFileDownload size={12} />}
        onClick={() => save(symbologyToSld(layer), 'sld', 'application/xml')}
        data-testid="symbology-export-sld"
      >
        Export SLD
      </Button>
      <Button
        size="compact-xs"
        variant="subtle"
        disabled={!layer.symbology}
        leftSection={<IconFileDownload size={12} />}
        onClick={() => save(symbologyToMapboxStyle(layer), 'json', 'application/json')}
        data-testid="symbology-export-mapbox"
      >
        Export Mapbox style
      </Button>
    </Group>
  );
}
