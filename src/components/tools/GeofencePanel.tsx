import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  TextInput,
  NumberInput,
  ScrollArea,
  Badge,
  SegmentedControl,
} from '@mantine/core';
import { IconMapPins, IconPlus, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useSpaceTimeStore } from '../../features/spacetime/store';
import type { Geofence } from '../../features/spacetime/types';

export function GeofencePanel({ onClose }: { onClose: () => void }) {
  const { geofences, addGeofence, removeGeofence } = useSpaceTimeStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'polygon'>('circle');
  const [lat, setLat] = useState<number | string>('');
  const [lng, setLng] = useState<number | string>('');
  const [radius, setRadius] = useState<number | string>(500);

  const handleAdd = () => {
    if (!name.trim()) return;
    const fence: Geofence = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      active: true,
      ...(type === 'circle'
        ? {
            center: [Number(lng) || 0, Number(lat) || 0],
            radius: Number(radius) || 500,
          }
        : { points: [] }),
    };
    addGeofence(fence);
    setName('');
    setLat('');
    setLng('');
  };

  return (
    <PanelCard width={300} maxHeight="calc(100vh - 120px)">
      <PanelHeader
        icon={<IconMapPins size={16} />}
        title="Geofences"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet">
            {geofences.length}
          </Badge>
        }
      />

      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Fence name…"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        <SegmentedControl
          size="xs"
          fullWidth
          value={type}
          onChange={(v) => setType(v as 'circle' | 'polygon')}
          data={[
            { value: 'circle', label: 'Circle' },
            { value: 'polygon', label: 'Polygon' },
          ]}
        />

        {type === 'circle' && (
          <>
            <Group gap="xs" grow>
              <NumberInput
                size="xs"
                label="Latitude"
                value={lat}
                onChange={setLat}
                decimalScale={6}
              />
              <NumberInput
                size="xs"
                label="Longitude"
                value={lng}
                onChange={setLng}
                decimalScale={6}
              />
            </Group>
            <NumberInput
              size="xs"
              label="Radius (meters)"
              value={radius}
              onChange={setRadius}
              min={10}
              max={100000}
            />
          </>
        )}

        {type === 'polygon' && (
          <Text size="xs" c="dimmed" ta="center">
            Click on the map to define polygon vertices. Double-click to finish.
          </Text>
        )}

        <Button
          size="xs"
          color="violet"
          leftSection={<IconPlus size={12} />}
          onClick={handleAdd}
          disabled={!name.trim()}
        >
          Add Geofence
        </Button>
      </Stack>

      <ScrollArea flex={1} mt="xs">
        <Stack gap={4}>
          {geofences.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No geofences defined
            </Text>
          ) : (
            geofences.map((f) => (
              <Group
                key={f.id}
                p="xs"
                style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                justify="space-between"
                wrap="nowrap"
              >
                <Group gap="xs" wrap="nowrap">
                  <Badge size="xs" variant="light" color={f.active ? 'green' : 'gray'}>
                    {f.type}
                  </Badge>
                  <Text size="xs" c="white" lineClamp={1}>
                    {f.name}
                  </Text>
                </Group>
                <ActionIcon aria-label="Delete geofence"
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => removeGeofence(f.id)}
                >
                  <IconTrash size={10} />
                </ActionIcon>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
