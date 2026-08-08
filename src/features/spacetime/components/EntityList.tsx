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
  Select,
} from '@mantine/core';
import { IconSearch, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSpaceTimeStore } from '../store';
import type { EntityKind } from '../types';

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

const KIND_OPTIONS: { value: EntityKind; label: string }[] = [
  { value: 'person', label: 'Person' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'device', label: 'Device' },
  { value: 'organization', label: 'Organization' },
  { value: 'location', label: 'Location' },
  { value: 'event', label: 'Event' },
  { value: 'document', label: 'Document' },
  { value: 'account', label: 'Account' },
];

export function EntityList() {
  const { entities, selectEntity, selectedEntityId, removeEntity, addEntity } =
    useSpaceTimeStore();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<EntityKind>('person');

  const filtered = Array.from(entities.values()).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.aliases.some((a) => a.toLowerCase().includes(search.toLowerCase())),
  );

  const handleAdd = () => {
    if (!newName.trim()) return;
    addEntity({
      id: crypto.randomUUID(),
      name: newName.trim(),
      kind: newKind,
      aliases: [],
      color: '#a78bfa',
      properties: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setNewName('');
    setAdding(false);
  };

  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        placeholder="Search entities…"
        leftSection={<IconSearch size={12} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
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
                    selectedEntityId === entity.id ? '#2d1b69' : 'var(--mantine-color-dark-6)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  border:
                    selectedEntityId === entity.id
                      ? '1px solid var(--mantine-color-violet-7)'
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

      <Button
        size="xs"
        variant="light"
        color="violet"
        leftSection={<IconPlus size={12} />}
        onClick={() => setAdding(!adding)}
      >
        Add Entity
      </Button>
      {adding && (
        <Group gap="xs">
          <TextInput
            size="xs"
            flex={1}
            placeholder="Entity name…"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Select
            size="xs"
            w={100}
            data={KIND_OPTIONS}
            value={newKind}
            onChange={(v) => v && setNewKind(v as EntityKind)}
          />
          <Button size="xs" color="violet" onClick={handleAdd}>
            Add
          </Button>
        </Group>
      )}
    </Stack>
  );
}
