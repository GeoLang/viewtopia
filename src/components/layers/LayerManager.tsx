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
  Select,
  Box,
} from '@mantine/core';
import { IconDownload, IconStack2, IconX, } from '@tabler/icons-react';
import { outputDownloadUrl } from '../../features/workflow/plan';
import { layerStyle, useAgentLayerStore, type AgentLayer } from '../../store/agentLayers';
import { choroplethFields } from '../../store/choropleth';

export interface LayerItem {
  id: string;
  name: string;
  type: 'raster' | 'vector' | 'tiles3d' | 'terrain' | 'geojson';
  visible: boolean;
  opacity: number;
}

const short = (v: number) => String(Number(v.toPrecision(3)));

/** One legend class as its value range, for the swatch's tooltip. */
function classLabel(classes: NonNullable<AgentLayer['choropleth']>, i: number): string {
  const upper = classes.breaks[i + 1];
  const range = upper === undefined ? `${short(classes.breaks[i])}+` : `${short(classes.breaks[i])} to ${short(upper)}`;
  return `${classes.field}: ${range}`;
}

/**
 * A layer the agent drew, from the store the renderers read. Its controls act on
 * that store, so opacity and remove reach the drawn layer. There is no
 * visibility switch because no renderer honours one, and the download only
 * appears for a layer that came from a file.
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
  const classify = useAgentLayerStore((s) => s.classify);
  const opacity = layerStyle(layer).opacity;
  const fields = expanded ? choroplethFields(layer) : [];
  const classes = layer.choropleth;

  return (
    <Paper
      p="xs"
      radius="sm"
      style={{ background: '#21262d', border: '1px solid #30363d', cursor: 'pointer' }}
      onClick={onExpand}
      data-testid="agent-layer-row"
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="white" lineClamp={1}>
          {layer.name}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          agent
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
              value={opacity}
              onChange={(v) => setOpacity(layer.id, v)}
            />
            <Text size="xs" c="dimmed" w={30}>
              {Math.round(opacity * 100)}%
            </Text>
          </Group>
          {/* a click in here would collapse the row, and the select needs its own */}
          <Box onClick={(e) => e.stopPropagation()}>
            {fields.length === 0 ? (
              <Text size="xs" c="dimmed" data-testid="agent-layer-no-shading">
                Nothing to shade by: no numeric field varies across these features.
              </Text>
            ) : (
              <Select
                size="xs"
                clearable
                placeholder="Shade by field"
                data={fields}
                value={classes?.field ?? null}
                onChange={(field) => classify(layer.id, field)}
                data-testid="agent-layer-field"
              />
            )}
          </Box>
          {classes && (
            <Group gap={2} wrap="nowrap" data-testid="agent-layer-legend">
              {classes.breaks.map((lower, i) => (
                <div
                  key={lower}
                  data-testid="agent-layer-legend-class"
                  title={classLabel(classes, i)}
                  style={{ background: classes.colors[i], width: 18, height: 8, borderRadius: 2 }}
                />
              ))}
              <Text size="xs" c="dimmed">
                {short(classes.breaks[0])}+
              </Text>
            </Group>
          )}
          <Group gap="xs" wrap="nowrap">
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
            {layer.path && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                component="a"
                href={outputDownloadUrl(layer.path)}
                download
                title={`Download ${layer.path.split('/').pop()}`}
                onClick={(e) => e.stopPropagation()}
                data-testid="agent-layer-download"
              >
                <IconDownload size={14} />
              </ActionIcon>
            )}
          </Group>
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
  const total = layers.length + agentLayers.length;

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
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
