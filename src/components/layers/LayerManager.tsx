import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Badge,
  ScrollArea,
  Switch,
  Slider,
  Button,
  Box,
} from '@mantine/core';
import { IconChevronRight, IconDownload, IconStack2, IconX, } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { downloadOutput } from '../../features/workflow/plan';
import {
  layerStyle,
  useAgentLayerStore,
  type AgentLayer,
  type AgentRasterLayer,
} from '../../store/agentLayers';
import { SymbologyEditor } from '../../features/symbology/SymbologyEditor';
import { geojsonToPmtiles } from '../../features/pmtiles/writer';

/** Tile and download the layer's features as a .pmtiles archive. */
function exportPmtiles(layer: AgentLayer): void {
  try {
    const bytes = geojsonToPmtiles(layer.sourceGeojson ?? layer.geojson, layer.name);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${layer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pmtiles`;
    anchor.click();
    URL.revokeObjectURL(href);
  } catch (err) {
    notifications.show({
      title: 'Export failed',
      message: err instanceof Error ? err.message : 'could not write archive',
      color: 'red',
    });
  }
}

export interface LayerItem {
  id: string;
  name: string;
  type: 'raster' | 'vector' | 'tiles3d' | 'terrain' | 'geojson';
  visible: boolean;
  opacity: number;
}

/**
 * A layer the agent drew, from the store the renderers read. Its controls act on
 * that store, so opacity and remove reach the drawn layer. There is no
 * visibility switch because no renderer honours one. The download sits on the
 * header, for a layer that came from a file; opacity, shading and remove are
 * secondary and stay behind the expand.
 */
function AgentLayerRow({
  layer,
  expanded,
  onExpand,
}: {
  layer: AgentLayer;
  expanded: boolean;
  onExpand: () => void;
}) {
  const setOpacity = useAgentLayerStore((s) => s.setLayerOpacity);
  const removeLayer = useAgentLayerStore((s) => s.removeLayer);
  const opacity = layerStyle(layer).opacity;

  return (
    <Paper
      p="xs"
      radius="sm"
      style={{ background: '#21262d', border: '1px solid #30363d', cursor: 'pointer' }}
      onClick={onExpand}
      data-testid="agent-layer-row"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconChevronRight
            size={12}
            color="#8b949e"
            data-testid="agent-layer-chevron"
            data-expanded={expanded}
            style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : undefined }}
          />
          <Text size="xs" c="white" lineClamp={1}>
            {layer.name}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Badge size="xs" variant="light" color="gray">
            agent
          </Badge>
          {/* on the header, not in the expanded block: a download nobody can see
              is a download nobody uses */}
          {layer.path && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              title={`Download ${layer.path.split('/').pop()}`}
              onClick={(e) => {
                e.stopPropagation();
                const path = layer.path;
                if (path) void downloadOutput(path);
              }}
              data-testid="agent-layer-download"
            >
              <IconDownload size={14} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      {expanded && (
        <Stack gap="xs" mt="xs">
          <Group gap="xs">
            <Text size="xs" c="dimmed" w={50}>
              Opacity
            </Text>
            <Slider
              size="xs"
              flex={1}
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(v) => setOpacity(layer.id, v)}
            />
            <Text size="xs" c="dimmed" w={30}>
              {Math.round(opacity * 100)}%
            </Text>
          </Group>
          {/* a click in here would collapse the row, and the selects need their own */}
          <Box onClick={(e) => e.stopPropagation()}>
            <SymbologyEditor layer={layer} />
          </Box>
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                exportPmtiles(layer);
              }}
              data-testid="agent-layer-export-pmtiles"
            >
              Export PMTiles
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                removeLayer(layer.id);
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      )}
    </Paper>
  );
}

/**
 * An analysis result draped over its bbox. No symbology or export: it is an
 * image, so opacity and remove are the whole surface.
 */
function RasterLayerRow({
  layer,
  expanded,
  onExpand,
}: {
  layer: AgentRasterLayer;
  expanded: boolean;
  onExpand: () => void;
}) {
  const setOpacity = useAgentLayerStore((s) => s.setRasterOpacity);
  const removeLayer = useAgentLayerStore((s) => s.removeRasterLayer);

  return (
    <Paper
      p="xs"
      radius="sm"
      style={{ background: '#21262d', border: '1px solid #30363d', cursor: 'pointer' }}
      onClick={onExpand}
      data-testid="raster-layer-row"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconChevronRight
            size={12}
            color="#8b949e"
            style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : undefined }}
          />
          <Text size="xs" c="white" lineClamp={1}>
            {layer.name}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color="gray">
          raster
        </Badge>
      </Group>

      {expanded && (
        <Stack gap="xs" mt="xs">
          <Group gap="xs">
            <Text size="xs" c="dimmed" w={50}>
              Opacity
            </Text>
            <Slider
              size="xs"
              flex={1}
              min={0}
              max={1}
              step={0.05}
              value={layer.opacity}
              onChange={(v) => setOpacity(layer.id, v)}
            />
            <Text size="xs" c="dimmed" w={30}>
              {Math.round(layer.opacity * 100)}%
            </Text>
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              removeLayer(layer.id);
            }}
          >
            Remove
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

interface LayerManagerProps {
  layers: LayerItem[];
  onToggle: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onClose: () => void;
}

export function LayerManager({
  layers,
  onToggle,
  onOpacity,
  onRemove,
  onClose,
}: LayerManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // the agent's own layers live in the store the renderers draw from, not in the
  // app-store list this panel is given. a plugin registers its layer in both, so
  // anything already listed above is skipped rather than shown twice
  const listed = new Set(layers.map((l) => l.id));
  const agentLayers = useAgentLayerStore((s) => s.layers).filter((l) => !listed.has(l.id));
  const rasterLayers = useAgentLayerStore((s) => s.rasterLayers);
  const total = layers.length + agentLayers.length + rasterLayers.length;

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconStack2 size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Layers ({total})
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {total === 0 && (
            <Text c="dimmed" size="xs" ta="center" py="md">
              No layers loaded
            </Text>
          )}
          {layers.map((layer) => (
            <Paper
              key={layer.id}
              p="xs"
              radius="sm"
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                cursor: 'pointer',
              }}
              onClick={() =>
                setExpandedId(expandedId === layer.id ? null : layer.id)
              }
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Switch
                    size="xs"
                    checked={layer.visible}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggle(layer.id);
                    }}
                  />
                  <Text size="xs" c="white" lineClamp={1}>
                    {layer.name}
                  </Text>
                </Group>
                <Badge size="xs" variant="light" color="gray">
                  {layer.type}
                </Badge>
              </Group>

              {expandedId === layer.id && (
                <Stack gap="xs" mt="xs">
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={50}>
                      Opacity
                    </Text>
                    <Slider
                      size="xs"
                      flex={1}
                      min={0}
                      max={1}
                      step={0.05}
                      value={layer.opacity}
                      onChange={(v) => onOpacity(layer.id, v)}
                    />
                    <Text size="xs" c="dimmed" w={30}>
                      {Math.round(layer.opacity * 100)}%
                    </Text>
                  </Group>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(layer.id);
                    }}
                  >
                    Remove
                  </Button>
                </Stack>
              )}
            </Paper>
          ))}
          {agentLayers.map((layer) => (
            <AgentLayerRow
              key={layer.id}
              layer={layer}
              expanded={expandedId === layer.id}
              onExpand={() => setExpandedId(expandedId === layer.id ? null : layer.id)}
            />
          ))}
          {rasterLayers.map((layer) => (
            <RasterLayerRow
              key={layer.id}
              layer={layer}
              expanded={expandedId === layer.id}
              onExpand={() => setExpandedId(expandedId === layer.id ? null : layer.id)}
            />
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
