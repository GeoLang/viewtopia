import {
  Paper,
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
import { useFeaturePickerStore } from '../../store/featurePicker';

export function FeaturePickerPanel({ onClose }: { onClose: () => void }) {
  const enabled = useFeaturePickerStore((s) => s.enabled);
  const toggle = useFeaturePickerStore((s) => s.toggle);
  const selected = useFeaturePickerStore((s) => s.selected);

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
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconClick size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Feature Info
          </Text>
          {selected && selected.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {selected.length}
            </Badge>
          )}
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
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
                    <Table.Td style={{ color: '#a78bfa', verticalAlign: 'top' }}>
                      {row.id}
                    </Table.Td>
                    <Table.Td style={{ color: '#c9d1d9', wordBreak: 'break-word' }}>
                      {row.value}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Paper>
  );
}
