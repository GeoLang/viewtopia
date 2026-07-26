import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  ScrollArea,
} from '@mantine/core';
import { IconVectorTriangle, IconX, IconPlus, IconTrash } from '@tabler/icons-react';
import { getActiveMapLibre } from '../../viewer/registry';

interface VTSource {
  id: string;
  name: string;
  url: string;
  sourceLayer: string;
}

// ptolemy MVT endpoint shape, works when the platform stack runs
const URL_PLACEHOLDER = '/api/v1/branches/{id}/tiles/{z}/{x}/{y}';

/**
 * MapLibre builds tile requests in a worker, where a root-relative template has
 * no base to resolve against and `new Request(url)` throws. Prefixing the origin
 * keeps the {z}/{x}/{y} braces intact, which `new URL()` would percent-encode.
 */
function absoluteTemplate(template: string): string {
  return template.startsWith('/') ? `${window.location.origin}${template}` : template;
}

export function VectorTilesPanel({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<VTSource[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [sourceLayer, setSourceLayer] = useState('default');
  const [status, setStatus] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    const map = getActiveMapLibre();
    if (!map) {
      setStatus('Switch renderer to MapLibre first');
      return;
    }
    if (!map.isStyleLoaded()) {
      setStatus('Map still loading, try again');
      return;
    }
    const id = `vt-${crypto.randomUUID()}`;
    const layer = sourceLayer.trim() || 'default';
    const tileUrl = absoluteTemplate(url.trim());
    map.addSource(id, { type: 'vector', tiles: [tileUrl], minzoom: 0, maxzoom: 22 });
    map.addLayer({
      id: `${id}-fill`,
      type: 'fill',
      source: id,
      'source-layer': layer,
      paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.25 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: 'line',
      source: id,
      'source-layer': layer,
      paint: { 'line-color': '#a78bfa', 'line-width': 1.5 },
    });
    setSources((prev) => [...prev, { id, name: name.trim(), url: tileUrl, sourceLayer: layer }]);
    setStatus(`Added ${name.trim()}`);
    setName('');
    setUrl('');
  };

  const handleRemove = (id: string) => {
    const map = getActiveMapLibre();
    if (map) {
      for (const layerId of [`${id}-fill`, `${id}-line`]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(id)) map.removeSource(id);
    }
    setSources((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 320,
        maxHeight: '55vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconVectorTriangle size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Vector Tiles
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" mb="xs">
        <TextInput
          size="xs"
          placeholder="Source name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <TextInput
          size="xs"
          placeholder={URL_PLACEHOLDER}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />
        <TextInput
          size="xs"
          label="Source layer"
          value={sourceLayer}
          onChange={(e) => setSourceLayer(e.currentTarget.value)}
          styles={{
            label: { color: '#8b949e' },
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          leftSection={<IconPlus size={14} />}
          onClick={handleAdd}
          disabled={!name.trim() || !url.trim()}
        >
          Add Source
        </Button>
        {status && (
          <Text size="xs" c="dimmed" data-testid="vt-status">
            {status}
          </Text>
        )}
      </Stack>

      <ScrollArea flex={1}>
        {sources.length > 0 ? (
          sources.map((s) => (
            <Group
              key={s.id}
              justify="space-between"
              p="xs"
              style={{ background: '#21262d', borderRadius: 4, marginBottom: 4 }}
              wrap="nowrap"
            >
              <Text size="xs" c="white" lineClamp={1}>
                {s.name}
              </Text>
              <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleRemove(s.id)}>
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            No vector tile sources added
          </Text>
        )}
      </ScrollArea>
    </Paper>
  );
}
