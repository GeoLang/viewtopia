import {
  Text,
  Stack,
  Switch,
  Badge,
  Table,
  ScrollArea,
} from '@mantine/core';
import { IconClick } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useFeaturePickerStore } from '../../store/featurePicker';

export function FeaturePickerPanel({ onClose }: { onClose: () => void }) {
  const enabled = useFeaturePickerStore((s) => s.enabled);
  const toggle = useFeaturePickerStore((s) => s.toggle);
  const selected = useFeaturePickerStore((s) => s.selected);

  return (
    <PanelCard width={300}>
      <PanelHeader
        icon={<IconClick size={16} />}
        title="Feature Info"
        onClose={onClose}
        closeLabel="Close feature info"
        badge={
          selected &&
          selected.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {selected.length}
            </Badge>
          )
        }
      />

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
