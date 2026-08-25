import {
  Text,
  Stack,
  Switch,
  Badge,
  Divider,
  Table,
  ScrollArea,
} from '@mantine/core';
import { IconClick } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useFeaturePickerStore, type FeatureProp } from '../../store/featurePicker';
import { useColumnLabels } from '../../store/datasetSchemas';
import { useAssetStateStore } from '../../live/assetState';
import { ASSET_ID_PROPERTY } from '../../live/types';

function pickedAssetId(selected: FeatureProp[] | null): string | null {
  return selected?.find((row) => row.id === ASSET_ID_PROPERTY)?.value ?? null;
}

/** Readings the feed keeps sending, so the section follows them without a second click. */
function AssetReadings({ assetId }: { assetId: string }) {
  const asset = useAssetStateStore((s) => s.assets[assetId]);
  if (!asset) return null;
  return (
    <Stack gap={4} data-testid="asset-live">
      <Divider label="Live" labelPosition="left" />
      <Table withRowBorders={false} verticalSpacing={2} fz="xs">
        <Table.Tbody>
          {Object.entries(asset.values).map(([kind, reading]) => (
            <Table.Tr key={kind}>
              <Table.Td style={{ color: 'var(--mantine-color-violet-4)' }}>{kind}</Table.Td>
              <Table.Td
                style={{ color: 'var(--mantine-color-dark-0)' }}
                data-testid={`asset-reading-${kind}`}
              >
                {reading.value} at {new Date(reading.at).toLocaleTimeString()}
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td style={{ color: 'var(--mantine-color-violet-4)' }}>state</Table.Td>
            <Table.Td
              style={{ color: asset.online ? 'var(--mantine-color-green-4)' : 'var(--mantine-color-dark-2)' }}
              data-testid="asset-online"
            >
              {asset.online ? 'online' : 'offline'}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function FeaturePickerPanel({ onClose }: { onClose: () => void }) {
  const enabled = useFeaturePickerStore((s) => s.enabled);
  const toggle = useFeaturePickerStore((s) => s.toggle);
  const selected = useFeaturePickerStore((s) => s.selected);
  const { columnLabel } = useColumnLabels();
  const assetId = pickedAssetId(selected);

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
                      {columnLabel(row.id)}
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

        {assetId && <AssetReadings assetId={assetId} />}
      </Stack>
    </PanelCard>
  );
}
