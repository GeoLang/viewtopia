import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Badge,
  Table,
  ScrollArea,
} from '@mantine/core';
import { IconClick, IconX } from '@tabler/icons-react';
import { PanelCard } from '../PanelCard';
import { useFeaturePickerStore } from '../../store/featurePicker';

export function FeaturePickerPanel({ onClose }: { onClose: () => void }) {
  const enabled = useFeaturePickerStore((s) => s.enabled);
  const toggle = useFeaturePickerStore((s) => s.toggle);
  const selected = useFeaturePickerStore((s) => s.selected);

  return (
    <PanelCard width={300}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconClick size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Feature Info
          </Text>
          {selected && selected.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {selected.length}
            </Badge>
          )}
        </Group>
        <ActionIcon
          aria-label="Close feature info"
          size="sm"
          variant="subtle"
          color="gray"
          onClick={onClose}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="sm"
          color="violet"
          checked={enabled}
          onChange={toggle}
          label="Click a feature to inspect"
        />

        {selected === null ? (
          <Text size="xs" c="dimmed">
            {enabled
              ? 'No feature selected. Click a building/point in the 3D scene.'
              : 'Enable picking, then click a feature.'}
          </Text>
        ) : selected.length === 0 ? (
          <Text size="xs" c="dimmed">
            No properties on this feature.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={320}>
            <Table withRowBorders={false} verticalSpacing={2} fz="xs">
              <Table.Tbody>
                {selected.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td style={{ color: 'var(--mantine-color-violet-4)', verticalAlign: 'top' }}>
                      {row.id}
                    </Table.Td>
                    <Table.Td style={{ color: 'var(--mantine-color-dark-0)', wordBreak: 'break-word' }}>
                      {row.value}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </PanelCard>
  );
}
