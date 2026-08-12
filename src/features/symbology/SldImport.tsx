import { Button, FileButton, Stack, Text } from '@mantine/core';
import { IconFileImport } from '@tabler/icons-react';
import { useState } from 'react';
import { useAgentLayerStore, type AgentLayer } from '../../store/agentLayers';
import {
  conversionSource,
  convertSld,
  unsupportedSource,
  type SldConversion,
} from './sldConversion';

const ACCEPT = '.sld,.xml,application/xml,text/xml';

/**
 * Load an SLD file onto this layer. fenestra does the conversion, and what it
 * could not carry is listed under the button rather than dropped quietly.
 */
export function SldImport({ layer }: { layer: AgentLayer }) {
  const setSymbology = useAgentLayerStore((s) => s.setSymbology);
  const [conversion, setConversion] = useState<SldConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const importFile = async (file: File | null) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setConversion(null);
    try {
      const result = await convertSld(await file.text());
      setConversion(result);
      if (result.symbology) setSymbology(layer.id, result.symbology);
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
            data-testid="symbology-import-sld"
          >
            Import SLD
          </Button>
        )}
      </FileButton>

      {conversion?.symbology && (
        <Text size="xs" c="dimmed" data-testid="sld-applied">
          {conversion.symbology.kind} symbology from {conversionSource(conversion)}
        </Text>
      )}

      {conversion && !conversion.symbology && (
        <Text size="xs" c="yellow" data-testid="sld-nothing-classified">
          {conversionSource(conversion)} classifies nothing by a property, so the layer keeps the
          colour it has.
        </Text>
      )}

      {conversion && conversion.unsupported.length > 0 && (
        <Stack gap={2} data-testid="sld-unsupported">
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
        <Text size="xs" c="red" data-testid="sld-error">
          {error}
        </Text>
      )}
    </Stack>
  );
}
