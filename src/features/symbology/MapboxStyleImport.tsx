import { Button, FileButton, Stack, Text } from '@mantine/core';
import { IconFileImport } from '@tabler/icons-react';
import { useState } from 'react';
import { useAgentLayerStore, type AgentLayer } from '../../store/agentLayers';
import { mapboxStyleToSymbology, type MapboxStyleConversion } from './mapboxStyle';
import { unsupportedSource } from './sldConversion';

const ACCEPT = '.json,application/json';

/**
 * Load a Mapbox GL style onto this layer. The conversion happens here, and what
 * the style said beyond the class colours is listed rather than dropped quietly.
 */
export function MapboxStyleImport({ layer }: { layer: AgentLayer }) {
  const setSymbology = useAgentLayerStore((s) => s.setSymbology);
  const [conversion, setConversion] = useState<MapboxStyleConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const importFile = async (file: File | null) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setConversion(null);
    try {
      const result = mapboxStyleToSymbology(await file.text());
      setConversion(result);
      setSymbology(layer.id, result.symbology);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setReading(false);
    }
  };

  return (
    <Stack gap={4}>
      <FileButton onChange={(file) => void importFile(file)} accept={ACCEPT}>
        {(props) => (
          <Button
            {...props}
            size="compact-xs"
            variant="subtle"
            loading={reading}
            leftSection={<IconFileImport size={12} />}
            data-testid="symbology-import-mapbox"
          >
            Import Mapbox style
          </Button>
        )}
      </FileButton>

      {conversion && (
        <Text size="xs" c="dimmed" data-testid="mapbox-applied">
          {conversion.symbology.kind} symbology from {conversion.layer}
        </Text>
      )}

      {conversion && conversion.unsupported.length > 0 && (
        <Stack gap={2} data-testid="mapbox-unsupported">
          <Text size="xs" c="orange">
            Not carried across ({conversion.unsupported.length}):
          </Text>
          {conversion.unsupported.map((entry) => (
            <Text key={`${entry.construct}-${entry.rule_index}-${entry.detail}`} size="xs" c="dimmed">
              {unsupportedSource(entry)}: {entry.detail}
            </Text>
          ))}
        </Stack>
      )}

      {error && (
        <Text size="xs" c="red" data-testid="mapbox-error">
          {error}
        </Text>
      )}
    </Stack>
  );
}
