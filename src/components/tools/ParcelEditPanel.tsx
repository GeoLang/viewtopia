import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Badge,
  SegmentedControl,
  Alert,
  List,
} from '@mantine/core';
import {
  IconX,
  IconScissors,
  IconBoxMultiple,
  IconAlertCircle,
  IconCheck,
} from '@tabler/icons-react';

type EditMode = 'split' | 'merge' | 'none';

interface ParcelEditPanelProps {
  selectedParcels: string[]; // APN/IDs of selected parcels
  onStartSplit: () => void; // Activate split-line drawing on map
  onStartMerge: () => void; // Activate merge selection on map
  onConfirmSplit: () => Promise<{ success: boolean; newApns?: string[] }>;
  onConfirmMerge: () => Promise<{ success: boolean; newApn?: string }>;
  onCancel: () => void;
  /** omitted when embedded in the real-estate plugin tabs, which has its own close */
  onClose?: () => void;
}

export function ParcelEditPanel({
  selectedParcels,
  onStartSplit,
  onStartMerge,
  onConfirmSplit,
  onConfirmMerge,
  onCancel,
  onClose,
}: ParcelEditPanelProps) {
  const [mode, setMode] = useState<EditMode>('none');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = (value: string) => {
    const newMode = value as EditMode;
    setMode(newMode);
    setResult(null);
    setError(null);
    if (newMode === 'split') {
      onStartSplit();
    } else if (newMode === 'merge') {
      onStartMerge();
    } else {
      onCancel();
    }
  };

  const handleConfirm = async () => {
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'split') {
        const res = await onConfirmSplit();
        if (res.success) {
          setResult(
            `Split complete. New parcels: ${res.newApns?.join(', ') || 'created'}`,
          );
        } else {
          setError('Split failed. Line must cross the parcel boundary in exactly two places.');
        }
      } else if (mode === 'merge') {
        const res = await onConfirmMerge();
        if (res.success) {
          setResult(`Merge complete. New parcel: ${res.newApn || 'created'}`);
        } else {
          setError('Merge failed. Selected parcels must share a common boundary.');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconScissors size={18} />
            <Text fw={600} size="sm">
              Parcel Edit
            </Text>
          </Group>
          {onClose && (
            <ActionIcon aria-label="Close parcel edit" size="sm" variant="subtle" onClick={onClose}>
              <IconX size={14} />
            </ActionIcon>
          )}
        </Group>

        <SegmentedControl
          size="xs"
          value={mode}
          onChange={handleModeChange}
          data={[
            { value: 'none', label: 'Select' },
            {
              value: 'split',
              label: (
                <Group gap={4}>
                  <IconScissors size={12} />
                  <span>Split</span>
                </Group>
              ),
            },
            {
              value: 'merge',
              label: (
                <Group gap={4}>
                  <IconBoxMultiple size={12} />
                  <span>Merge</span>
                </Group>
              ),
            },
          ]}
        />

        {mode === 'split' && (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Draw a line across the selected parcel to split it into two lots.
            </Text>
            <List size="xs" spacing={2}>
              <List.Item>Click to start the split line</List.Item>
              <List.Item>Click again to end the line</List.Item>
              <List.Item>Line must cross two edges of the parcel</List.Item>
              <List.Item>Without a drawn line the parcel is cut across the middle of its bounding box</List.Item>
            </List>
            {selectedParcels.length === 1 && (
              <Badge size="sm" variant="light">
                Splitting: {selectedParcels[0]}
              </Badge>
            )}
            {selectedParcels.length !== 1 && (
              <Alert
                color="yellow"
                icon={<IconAlertCircle size={14} />}
              >
                Select exactly one parcel to split.
              </Alert>
            )}
          </Stack>
        )}

        {mode === 'merge' && (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Select two or more adjacent parcels to merge into a single lot.
            </Text>
            <List size="xs" spacing={2}>
              <List.Item>Click parcels to select them</List.Item>
              <List.Item>Selected parcels must share a boundary</List.Item>
              <List.Item>All selected parcels must have same owner</List.Item>
            </List>
            {selectedParcels.length >= 2 && (
              <Badge size="sm" variant="light">
                Merging: {selectedParcels.length} parcels
              </Badge>
            )}
            {selectedParcels.length < 2 && (
              <Alert
                color="yellow"
                icon={<IconAlertCircle size={14} />}
              >
                Select at least 2 adjacent parcels to merge.
              </Alert>
            )}
          </Stack>
        )}

        {mode !== 'none' && (
          <Group gap="xs">
            <Button
              size="xs"
              onClick={handleConfirm}
              loading={processing}
              disabled={
                (mode === 'split' && selectedParcels.length !== 1) ||
                (mode === 'merge' && selectedParcels.length < 2)
              }
              leftSection={<IconCheck size={14} />}
            >
              Confirm
            </Button>
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                setMode('none');
                onCancel();
              }}
            >
              Cancel
            </Button>
          </Group>
        )}

        {result && (
          <Alert color="green" icon={<IconCheck size={14} />}>
            {result}
          </Alert>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={14} />}>
            {error}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
