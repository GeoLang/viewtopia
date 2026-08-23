import { useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  Text,
  Card,
  ActionIcon,
  TextInput,
  SimpleGrid,
  Box,
  Progress,
  Collapse,
} from '@mantine/core';
import { IconPlus, IconTrash, IconArrowLeft, IconSettings } from '@tabler/icons-react';
import { useDashboardsStore } from './store';
import { ChartView, ChartEditor } from './ChartWidget';
import { MapView, MapEditor } from './MapWidget';
import type { ChartDatum, ChartType, DashboardWidget, WidgetType } from './types';

const WIDGET_TYPES: { type: WidgetType; label: string; desc: string }[] = [
  { type: 'map', label: '🗺️ Map', desc: 'Embedded map view' },
  { type: 'chart', label: '📈 Chart', desc: 'Bar, line, or pie chart' },
  { type: 'indicator', label: '🔢 Indicator', desc: 'Single value display' },
  { type: 'gauge', label: '⏲️ Gauge', desc: 'Progress/percentage gauge' },
  { type: 'list', label: '📋 List', desc: 'Feature or data list' },
  { type: 'richtext', label: '📝 Rich Text', desc: 'Formatted text block' },
];

function WidgetContent({ widget }: { widget: DashboardWidget }) {
  const c = widget.config;
  switch (widget.type) {
    case 'indicator':
      return (
        <Stack gap={0} align="center" py="sm">
          <Text size="xl" fw={700} c="violet">
            {(c.value as string) ?? '—'}
          </Text>
          <Text size="xs" c="dimmed">
            {(c.label as string) || ''}
          </Text>
        </Stack>
      );
    case 'gauge':
      return (
        <Stack gap={4} py="sm">
          <Progress value={(c.percent as number) ?? 0} color="violet" />
          <Text size="xs" c="dimmed" ta="right">
            {(c.percent as number) ?? 0}%
          </Text>
        </Stack>
      );
    case 'list':
      return (
        <Stack gap={2} py="xs">
          {((c.items as string[]) || []).length === 0 ? (
            <Text size="xs" c="dimmed">
              No items
            </Text>
          ) : (
            ((c.items as string[]) || []).map((i, idx) => (
              <Text key={idx} size="xs" c="gray.4">
                • {i}
              </Text>
            ))
          )}
        </Stack>
      );
    case 'richtext':
      return (
        <Box
          fz="xs"
          c="gray.4"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: user's own localStorage content, no backend
          dangerouslySetInnerHTML={{ __html: (c.html as string) || '' }}
        />
      );
    case 'chart':
      return (
        <ChartView
          chartType={(c.chartType as ChartType) ?? 'bar'}
          data={(c.data as ChartDatum[]) ?? []}
        />
      );
    case 'map':
      return (
        <MapView center={(c.center as [number, number]) ?? [0, 0]} zoom={(c.zoom as number) ?? 1} />
      );
    default:
      return (
        <Text size="xs" c="dimmed">
          Configure widget
        </Text>
      );
  }
}

export function DashboardPanel({ onClose }: { onClose: () => void }) {
  const { dashboards, activeId, projectId, refresh, create, open, back, remove, renameActive, addWidget, removeWidget } =
    useDashboardsStore();
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = dashboards.find((d) => d.id === activeId) ?? null;

  return (
    <Modal
      opened
      onClose={onClose}
      title={active ? 'Edit Dashboard' : 'Dashboards'}
      size="xl"
      centered
    >
      {!active ? (
        // ---- List view ----
        <Stack gap="sm">
          {!projectId ? (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              Dashboards live in a project. Open one first.
            </Text>
          ) : dashboards.length === 0 ? (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              No dashboards yet. Create your first one!
            </Text>
          ) : (
            dashboards.map((d) => (
              <Card
                key={d.id}
                padding="sm"
                radius="md"
                withBorder
                style={{ cursor: 'pointer', background: 'var(--mantine-color-dark-7)', borderColor: 'var(--mantine-color-dark-5)' }}
                onClick={() => open(d.id)}
              >
                <Group justify="space-between">
                  <Stack gap={0}>
                    <Text size="sm" fw={600} c="white">
                      {d.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {d.widgets.length} widget{d.widgets.length !== 1 ? 's' : ''} ·{' '}
                      {new Date(d.modified).toLocaleDateString()}
                    </Text>
                  </Stack>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Delete dashboard"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(d.id);
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Card>
            ))
          )}
          <Button
            variant="light"
            color="violet"
            leftSection={<IconPlus size={14} />}
            onClick={create}
            disabled={!projectId}
          >
            New Dashboard
          </Button>
        </Stack>
      ) : (
        // ---- Editor view ----
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" aria-label="Back" onClick={back}>
              <IconArrowLeft size={16} />
            </ActionIcon>
            <TextInput
              style={{ flex: 1 }}
              value={active.title}
              onChange={(e) => renameActive(e.currentTarget.value)}
            />
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconPlus size={14} />}
              onClick={() => setPicking((p) => !p)}
            >
              Widget
            </Button>
          </Group>

          {picking && (
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
              {WIDGET_TYPES.map((t) => (
                <Button
                  key={t.type}
                  variant="default"
                  size="xs"
                  h="auto"
                  py="xs"
                  onClick={() => {
                    addWidget(t.type);
                    setPicking(false);
                  }}
                >
                  <Stack gap={0} align="center">
                    <Text size="xs">{t.label}</Text>
                  </Stack>
                </Button>
              ))}
            </SimpleGrid>
          )}

          {active.widgets.length === 0 ? (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              No widgets yet. Add one with the “Widget” button.
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              {active.widgets.map((w) => (
                <Card
                  key={w.id}
                  padding="xs"
                  radius="md"
                  withBorder
                  style={{ background: 'var(--mantine-color-dark-7)', borderColor: 'var(--mantine-color-dark-5)' }}
                >
                  <Group justify="space-between" mb={4} wrap="nowrap">
                    <Text size="xs" fw={600} c="white" lineClamp={1}>
                      {w.title}
                    </Text>
                    <Group gap={2} wrap="nowrap">
                      {(w.type === 'chart' || w.type === 'map') && (
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          aria-label="Widget settings"
                          onClick={() => setEditingId((id) => (id === w.id ? null : w.id))}
                        >
                          <IconSettings size={12} />
                        </ActionIcon>
                      )}
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        aria-label="Remove widget"
                        onClick={() => removeWidget(w.id)}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <WidgetContent widget={w} />
                  {(w.type === 'chart' || w.type === 'map') && (
                    <Collapse in={editingId === w.id}>
                      {w.type === 'chart' ? <ChartEditor widget={w} /> : <MapEditor widget={w} />}
                    </Collapse>
                  )}
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      )}
    </Modal>
  );
}
