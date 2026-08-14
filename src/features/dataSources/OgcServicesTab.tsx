import {
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Select,
  Badge,
} from '@mantine/core';
import { IconX, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { loadPmtilesLayer, loadWfsLayer, type OGCLayer, type OGCType } from '../../store/ogcLayers';

interface OgcServicesTabProps {
  layers: OGCLayer[];
  onAdd: (name: string, url: string, type: OGCType) => OGCLayer;
  onRemove: (id: string) => void;
}

const WMTS_NOTE = 'WMTS: paste the RESTful tile template. KVP and GetCapabilities are not read yet.';

export function OgcServicesTab({ layers, onAdd, onRemove }: OgcServicesTabProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<OGCType>('wms');
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    const added = onAdd(name.trim(), url.trim(), type);
    setName('');
    setUrl('');
    if (added.type !== 'wfs' && added.type !== 'pmtiles') {
      setStatus({ text: `Added ${added.name}`, failed: false });
      return;
    }
    // WFS and PMTiles are requests, not tile templates: they either answer or
    // they fail, and the panel is where that has to show
    setLoading(true);
    setStatus({ text: `Loading ${added.name}…`, failed: false });
    try {
      if (added.type === 'pmtiles') {
        const info = await loadPmtilesLayer(added);
        setStatus({
          text: `${added.name}: ${info.kind}, zoom ${info.minZoom}–${info.maxZoom}`,
          failed: false,
        });
      } else {
        const count = await loadWfsLayer(added);
        setStatus({ text: `${added.name}: ${count} features`, failed: false });
      }
    } catch (e) {
      onRemove(added.id);
      setStatus({
        text: `${added.name}: ${e instanceof Error ? e.message : 'request failed'}`,
        failed: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack gap="xs" mb="xs" p="xs" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}>
        <TextInput
          size="xs"
          placeholder="Layer name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          placeholder="Service URL"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
        <Group gap="xs">
          <Select
            size="xs"
            flex={1}
            aria-label="Type"
            data={[
              { value: 'wms', label: 'WMS' },
              { value: 'wmts', label: 'WMTS' },
              { value: 'wfs', label: 'WFS' },
              { value: 'xyz', label: 'XYZ Tiles' },
              { value: 'pmtiles', label: 'PMTiles' },
            ]}
            value={type}
            onChange={(v) => v && setType(v as OGCType)}
          />
          <Button
            size="xs"
            color="violet"
            leftSection={<IconPlus size={12} />}
            onClick={handleAdd}
            loading={loading}
            disabled={!name.trim() || !url.trim()}
          >
            Add
          </Button>
        </Group>
        {type === 'wmts' && (
          <Text size="xs" c="dimmed" data-testid="ogc-wmts-note">
            {WMTS_NOTE}
          </Text>
        )}
        {type === 'pmtiles' && (
          <Text size="xs" c="dimmed" data-testid="ogc-pmtiles-note">
            PMTiles: drawn by the MapLibre renderer only. A .pmtiles file can also
            be dropped straight onto the map.
          </Text>
        )}
        {status && (
          <Text size="xs" c={status.failed ? 'red' : 'dimmed'} data-testid="ogc-status">
            {status.text}
          </Text>
        )}
      </Stack>

      <Stack gap={4}>
        {layers.length === 0 ? (
          <Text c="dimmed" size="xs" ta="center" py="md">
            No OGC layers added
          </Text>
        ) : (
          layers.map((layer) => (
            <Group
              key={layer.id}
              justify="space-between"
              p="xs"
              style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
            >
              <Stack gap={0}>
                <Text size="xs" c="white">
                  {layer.name}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {layer.url}
                </Text>
              </Stack>
              <Group gap={4}>
                <Badge size="xs" variant="light">
                  {layer.type.toUpperCase()}
                </Badge>
                <ActionIcon aria-label="Remove layer"
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => onRemove(layer.id)}
                >
                  <IconX size={10} />
                </ActionIcon>
              </Group>
            </Group>
          ))
        )}
      </Stack>
    </>
  );
}
