import { Button, FileButton, Stack, Text } from '@mantine/core';
import { IconFileImport } from '@tabler/icons-react';
import { useState } from 'react';
import { useAgentLayerStore, type AgentLayer } from '../../store/agentLayers';
import { qmlToSymbology, type QmlConversion } from './qmlStyle';
import { unsupportedSource } from './sldConversion';

const ACCEPT = '.qml,application/xml,text/xml';

/**
 * Load a QGIS layer style onto this layer. The conversion happens here, and what
 * the style said beyond the class colours is listed rather than dropped quietly.
 */
export function QmlImport({ layer }: { layer: AgentLayer }) {
  const setSymbology = useAgentLayerStore((s) => s.setSymbology);
  const setLayerColor = useAgentLayerStore((s) => s.setLayerColor);
  const setLayerOpacity = useAgentLayerStore((s) => s.setLayerOpacity);
  const setZoomRange = useAgentLayerStore((s) => s.setZoomRange);
  const [conversion, setConversion] = useState<QmlConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const importFile = async (file: File | null) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setConversion(null);
    try {
      const result = qmlToSymbology(await file.text());
      setConversion(result);
      setSymbology(layer.id, result.symbology);
      if (result.color) setLayerColor(layer.id, result.color);
      if (result.opacity !== null) setLayerOpacity(layer.id, result.opacity);
      setZoomRange(layer.id, result.zoomRange);
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
            data-testid="symbology-import-qml"
          >
            Import QGIS style
          </Button>
        )}
      </FileButton>

      {conversion?.symbology && (
        <Text size="xs" c="dimmed" data-testid="qml-applied">
          {conversion.symbology.kind} symbology from {conversion.source}
        </Text>
      )}

      {conversion && !conversion.symbology && (
        <Text size="xs" c="yellow" data-testid="qml-single-symbol">
          {conversion.source} paints every feature the same, so the layer takes that one colour.
        </Text>
      )}

      {conversion && conversion.unsupported.length > 0 && (
        <Stack gap={2} data-testid="qml-unsupported">
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
        <Text size="xs" c="red" data-testid="qml-error">
          {error}
        </Text>
      )}
    </Stack>
  );
}
