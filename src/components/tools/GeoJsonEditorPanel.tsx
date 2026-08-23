import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconVectorTriangle, IconTrash, IconDownload } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore, featuresToGeoJSON } from '../../store/draw';
import {
  PropertyRows,
  rowsFromProperties,
  rowsToProperties,
  type PropertyRow,
} from './PropertyRows';

export function GeoJsonEditorPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const removeFeature = useDrawStore((s) => s.removeFeature);
  const setFeatureProperties = useDrawStore((s) => s.setFeatureProperties);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<PropertyRow[]>([]);

  const selected = features.find((f) => f.id === selectedId) ?? null;

  // Load rows whenever the selection changes (or the selected feature disappears).
  useEffect(() => {
    if (!selectedId && features.length > 0) {
      setSelectedId(features[0].id);
      return;
    }
    setRows(rowsFromProperties(selected?.properties));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, features.length]);

  const commit = (next: PropertyRow[]) => {
    setRows(next);
    if (selectedId) setFeatureProperties(selectedId, rowsToProperties(next));
  };

  const downloadGeoJSON = () => {
    const blob = new Blob([JSON.stringify(featuresToGeoJSON(features), null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viewtopia-features-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PanelCard width={320}>
      <PanelHeader
        icon={<IconVectorTriangle size={16} />}
        title="GeoJSON Editor"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet">
            {features.length}
          </Badge>
        }
      />

      {features.length === 0 ? (
        <Text size="xs" c="dimmed">
          No features yet. Draw shapes with the Draw tool, then edit their properties here.
        </Text>
      ) : (
        <Stack gap="xs">
          {/* Feature list */}
          <ScrollArea.Autosize mah={120}>
            <Stack gap={2}>
              {features.map((f, i) => (
                <Group
                  key={f.id}
                  justify="space-between"
                  px={6}
                  py={2}
                  style={{
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: f.id === selectedId ? 'var(--mantine-color-dark-6)' : 'transparent',
                  }}
                  onClick={() => setSelectedId(f.id)}
                >
                  <Text size="xs" c={f.id === selectedId ? 'violet' : 'gray.4'}>
                    {i + 1}. {f.type}
                    {f.properties && Object.keys(f.properties).length > 0
                      ? ` (${Object.keys(f.properties).length})`
                      : ''}
                  </Text>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    aria-label="Delete feature"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFeature(f.id);
                      if (f.id === selectedId) setSelectedId(null);
                    }}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>

          {/* Property editor for the selected feature */}
          {selected && (
            <>
              <Text size="xs" c="dimmed">
                Properties
              </Text>
              <ScrollArea.Autosize mah={220}>
                <PropertyRows rows={rows} onChange={commit} color="violet" />
              </ScrollArea.Autosize>
            </>
          )}

          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconDownload size={12} />}
            onClick={downloadGeoJSON}
          >
            Export GeoJSON
          </Button>
        </Stack>
      )}
    </PanelCard>
  );
}
