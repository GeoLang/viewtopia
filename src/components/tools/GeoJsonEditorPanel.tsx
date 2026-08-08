import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconVectorTriangle, IconX, IconPlus, IconTrash, IconDownload } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore, featuresToGeoJSON } from '../../store/draw';

interface Row {
  key: string;
  value: string;
}

function rowsFromProps(props?: Record<string, string>): Row[] {
  return Object.entries(props ?? {}).map(([key, value]) => ({ key, value }));
}

function rowsToProps(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
}

export function GeoJsonEditorPanel({ onClose }: { onClose: () => void }) {
  const features = useDrawStore((s) => s.features);
  const removeFeature = useDrawStore((s) => s.removeFeature);
  const setFeatureProperties = useDrawStore((s) => s.setFeatureProperties);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const selected = features.find((f) => f.id === selectedId) ?? null;

  // Load rows whenever the selection changes (or the selected feature disappears).
  useEffect(() => {
    if (!selectedId && features.length > 0) {
      setSelectedId(features[0].id);
      return;
    }
    setRows(rowsFromProps(selected?.properties));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, features.length]);

  const commit = (next: Row[]) => {
    setRows(next);
    if (selectedId) setFeatureProperties(selectedId, rowsToProps(next));
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
                <Stack gap={4}>
                  {rows.length === 0 && (
                    <Text size="xs" c="dimmed">
                      No properties.
                    </Text>
                  )}
                  {rows.map((row, idx) => (
                    <Group key={idx} gap={4} wrap="nowrap">
                      <TextInput
                        size="xs"
                        placeholder="key"
                        value={row.key}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, key: e.currentTarget.value };
                          commit(next);
                        }}
                        styles={{ input: { width: 110 } }}
                      />
                      <TextInput
                        size="xs"
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, value: e.currentTarget.value };
                          commit(next);
                        }}
                        style={{ flex: 1 }}
                      />
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label="Remove property"
                        onClick={() => commit(rows.filter((_, i) => i !== idx))}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
              <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={<IconPlus size={12} />}
                onClick={() => commit([...rows, { key: '', value: '' }])}
              >
                Add Property
              </Button>
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
