import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  ScrollArea,
} from '@mantine/core';
import { IconVectorTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import type { LayerSpecification } from 'maplibre-gl';
import { getActiveMapLibre } from '../../viewer/registry';
import { fetchDatasetStyle, PTOLEMY_SOURCE_LAYER } from '../../lib/datasetStyle';
import { decodeStyleImage, decodeStyleImages } from '../../lib/styleImages';

interface VTSource {
  id: string;
  name: string;
  url: string;
  sourceLayer: string;
  layerIds: string[];
  imageIds: string[];
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

/** Violet fill and outline, for a source with no dataset style to draw with. */
function defaultLayers(id: string, sourceLayer: string): LayerSpecification[] {
  return [
    {
      id: `${id}-fill`,
      type: 'fill',
      source: id,
      'source-layer': sourceLayer,
      paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.25 },
    },
    {
      id: `${id}-line`,
      type: 'line',
      source: id,
      'source-layer': sourceLayer,
      paint: { 'line-color': '#a78bfa', 'line-width': 1.5 },
    },
  ];
}

export function VectorTilesPanel({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<VTSource[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [sourceLayer, setSourceLayer] = useState('default');
  const [status, setStatus] = useState('');

  const dataset = datasetId.trim();

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    const id = `vt-${crypto.randomUUID()}`;
    // ptolemy hardcodes its MVT layer name, so a dataset id settles the source layer
    const layer = dataset ? PTOLEMY_SOURCE_LAYER : sourceLayer.trim() || 'default';
    const style = dataset ? await fetchDatasetStyle(dataset, id, layer) : null;
    // decode the sprites before touching the map, so all the waiting happens here
    const images = style ? await decodeStyleImages(style.images, decodeStyleImage) : [];
    // re-read the map: the style request gave the user time to switch renderer
    const map = getActiveMapLibre();
    if (!map) {
      setStatus('Switch renderer to MapLibre first');
      return;
    }
    if (!map.isStyleLoaded()) {
      setStatus('Map still loading, try again');
      return;
    }
    const tileUrl = absoluteTemplate(url.trim());
    map.addSource(id, { type: 'vector', tiles: [tileUrl], minzoom: 0, maxzoom: 22 });
    // the layers reference these by name, so they go in first
    for (const { name: imageId, image } of images) map.addImage(imageId, image);
    const layers = style?.layers ?? defaultLayers(id, layer);
    for (const spec of layers) map.addLayer(spec);
    setSources((prev) => [
      ...prev,
      {
        id,
        name: name.trim(),
        url: tileUrl,
        sourceLayer: layer,
        layerIds: layers.map((l) => l.id),
        imageIds: images.map((i) => i.name),
      },
    ]);
    if (style?.losses.length) console.debug(`dataset ${dataset} style losses`, style.losses);
    setStatus(
      style
        ? `Added ${name.trim()}, dataset style (${style.layers.length} layers, ${style.losses.length} dropped)`
        : `Added ${name.trim()}`,
    );
    setName('');
    setUrl('');
    setDatasetId('');
  };

  const handleRemove = (id: string) => {
    const map = getActiveMapLibre();
    if (map) {
      const source = sources.find((x) => x.id === id);
      for (const layerId of source?.layerIds ?? []) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const imageId of source?.imageIds ?? []) {
        if (map.hasImage(imageId)) map.removeImage(imageId);
      }
      if (map.getSource(id)) map.removeSource(id);
    }
    setSources((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <PanelCard width={320} maxHeight="55vh">
      <PanelHeader
        icon={<IconVectorTriangle size={16} />}
        title="Vector Tiles"
        onClose={onClose}
      />

      <Stack gap="xs" mb="xs">
        <TextInput
          size="xs"
          placeholder="Source name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          placeholder={URL_PLACEHOLDER}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          label="Dataset ID"
          description="ptolemy dataset, styles the source from its Esri style"
          placeholder="optional"
          value={datasetId}
          onChange={(e) => setDatasetId(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          label="Source layer"
          value={dataset ? PTOLEMY_SOURCE_LAYER : sourceLayer}
          disabled={!!dataset}
          onChange={(e) => setSourceLayer(e.currentTarget.value)}
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
              style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4, marginBottom: 4 }}
              wrap="nowrap"
            >
              <Text size="xs" c="white" lineClamp={1}>
                {s.name}
              </Text>
              <ActionIcon aria-label="Remove vector tile source" size="xs" variant="subtle" color="red" onClick={() => handleRemove(s.id)}>
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
    </PanelCard>
  );
}
