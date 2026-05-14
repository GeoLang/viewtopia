import { useState } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Group,
  Text,
  Badge,
  ActionIcon,
  Button,
} from '@mantine/core';
import { IconSearch, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSpaceTimeStore } from '../store';
import type { Entity, EntityKind } from '../types';

const KIND_COLORS: Record<EntityKind, string> = {
  person: 'violet',
  vehicle: 'blue',
  device: 'cyan',
  organization: 'orange',
  location: 'green',
  event: 'yellow',
  document: 'gray',
  account: 'pink',
};

export function EntityList() {
  const { entities, selectEntity, selectedEntityId, removeEntity } =
    useSpaceTimeStore();
  const [search, setSearch] = useState('');

  const filtered = Array.from(entities.values()).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.aliases.some((a) => a.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        placeholder="Search entities…"
        leftSection={<IconSearch size={12} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        styles={{
          input: { background: '#0d1117', borderColor: '#30363d' },
        }}
      />

      <ScrollArea mah={350}>
        <Stack gap={4}>
          {filtered.length === 0 ? (
            <Text c="dimmed" size="xs" ta="center" py="md">
              {entities.size === 0
                ? 'No entities — import data or create one'
                : 'No matches'}
            </Text>
          ) : (
            filtered.map((entity) => (
              <Group
                key={entity.id}
                p="xs"
                style={{
                  background:
                    selectedEntityId === entity.id ? '#2d1b69' : '#21262d',
                  borderRadius: 4,
                  cursor: 'pointer',
                  border:
                    selectedEntityId === entity.id
                      ? '1px solid #7c3aed'
                      : '1px solid transparent',
                }}
                onClick={() => selectEntity(entity.id)}
                justify="space-between"
                wrap="nowrap"
              >
                <Group gap="xs" wrap="nowrap">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: entity.color,
                      flexShrink: 0,
                    }}
                  />
                  <Stack gap={0}>
                    <Text size="xs" c="white" fw={500} lineClamp={1}>
                      {entity.name}
                    </Text>
                    {entity.aliases.length > 0 && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {entity.aliases[0]}
                      </Text>
                    )}
                  </Stack>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Badge
                    size="xs"
                    variant="light"
                    color={KIND_COLORS[entity.kind]}
                  >
                    {entity.kind}
                  </Badge>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEntity(entity.id);
                    }}
                  >
                    <IconTrash size={10} />
                  </ActionIcon>
                </Group>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>

      <Button size="xs" variant="light" color="violet" leftSection={<IconPlus size={12} />}>
        Add Entity
      </Button>
    </Stack>
  );
}
