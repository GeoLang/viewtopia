import { Button, Group, Stack, Text } from '@mantine/core';
import { IconFileDownload } from '@tabler/icons-react';
import { useState } from 'react';
import type { AgentLayer } from '../../store/agentLayers';
import { symbologyToMapboxStyle } from './mapboxStyle';
import { qmlExportLosses, symbologyToQml } from './qmlStyle';
import { unsupportedSource, type UnsupportedConstruct } from './sldConversion';
import { sldExportLosses, symbologyToSld } from './sldExport';
import type { Symbology } from './symbology';

function download(text: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const fileStem = (name: string) => name.trim().replace(/[^\w.-]+/g, '-').toLowerCase() || 'layer';

interface ExportFormat {
  label: string;
  testId: string;
  extension: string;
  mimeType: string;
  write: (layer: AgentLayer) => string | null;
  /** What this format has no place for, listed rather than dropped quietly. */
  losses: (sym: Symbology | undefined) => UnsupportedConstruct[];
  /** A QML carries the single colour too, so that one writes without symbology. */
  needsSymbology: boolean;
}

const FORMATS: ExportFormat[] = [
  {
    label: 'Export SLD',
    testId: 'symbology-export-sld',
    extension: 'sld',
    mimeType: 'application/xml',
    write: symbologyToSld,
    losses: sldExportLosses,
    needsSymbology: true,
  },
  {
    label: 'Export Mapbox style',
    testId: 'symbology-export-mapbox',
    extension: 'json',
    mimeType: 'application/json',
    write: symbologyToMapboxStyle,
    losses: () => [],
    needsSymbology: true,
  },
  {
    label: 'Export QGIS style',
    testId: 'symbology-export-qml',
    extension: 'qml',
    mimeType: 'application/xml',
    write: symbologyToQml,
    losses: qmlExportLosses,
    needsSymbology: false,
  },
];

/** Save this layer's classes as a file another GIS reads. */
export function SymbologyExport({ layer }: { layer: AgentLayer }) {
  const [losses, setLosses] = useState<UnsupportedConstruct[]>([]);

  const save = (format: ExportFormat) => {
    const contents = format.write(layer);
    setLosses(contents ? format.losses(layer.symbology) : []);
    if (contents) {
      download(contents, `${fileStem(layer.name)}.${format.extension}`, format.mimeType);
    }
  };

  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
        {FORMATS.map((format) => (
          <Button
            key={format.testId}
            size="compact-xs"
            variant="subtle"
            disabled={format.needsSymbology && !layer.symbology}
            leftSection={<IconFileDownload size={12} />}
            onClick={() => save(format)}
            data-testid={format.testId}
          >
            {format.label}
          </Button>
        ))}
      </Group>

      {losses.length > 0 && (
        <Stack gap={2} data-testid="symbology-export-unsupported">
          <Text size="xs" c="orange">
            Not carried across ({losses.length}):
          </Text>
          {losses.map((entry) => (
            <Text key={`${entry.construct}-${entry.detail}`} size="xs" c="dimmed">
              {unsupportedSource(entry)}: {entry.detail}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
