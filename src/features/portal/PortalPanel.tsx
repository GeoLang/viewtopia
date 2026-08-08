import { useEffect, useState } from 'react';
import {
  Modal,
  Group,
  TextInput,
  Select,
  SimpleGrid,
  Card,
  Text,
  Badge,
  Button,
  Stack,
  ActionIcon,
  Textarea,
  Box,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { usePortalStore, openPortalItem } from './store';
import type { PortalItemType, PortalSharing } from './types';
import { useAuthStore } from '../auth/store';

const TYPE_OPTIONS = [
  { value: 'map', label: 'Maps' },
  { value: 'layer', label: 'Layers' },
  { value: 'dataset', label: 'Datasets' },
  { value: 'story', label: 'Stories' },
  { value: 'app', label: 'Apps' },
];

const SHARING_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'org', label: 'Organization' },
  { value: 'private', label: 'My Items' },
];

export function PortalPanel({ onClose }: { onClose: () => void }) {
  const {
    query,
    typeFilter,
    sharingFilter,
    setQuery,
    setTypeFilter,
    setSharingFilter,
    refresh,
    addItem,
    deleteItem,
    filtered,
    error,
    needsSignIn,
  } = usePortalStore();
  const owner = useAuthStore((s) => s.user?.name);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'map' as PortalItemType,
    description: '',
    tags: '',
    sharing: 'private' as PortalSharing,
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const items = filtered();

  const submitAdd = async () => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    await addItem({
      id: crypto.randomUUID(),
      title: form.title.trim(),
      type: form.type,
      description: form.description,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      sharing: form.sharing,
      owner: owner || 'anonymous',
      thumbnail: '',
      created: now,
      modified: now,
    });
    setForm({ title: '', type: 'map', description: '', tags: '', sharing: 'private' });
    setAdding(false);
  };

  return (
    <Modal opened onClose={onClose} title="Content Catalog" size="xl" centered>
      <Stack gap="sm">
        <Group gap="xs" grow>
          <TextInput
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <Select
            placeholder="All Types"
            clearable
            data={TYPE_OPTIONS}
            value={typeFilter || null}
            onChange={(v) => setTypeFilter((v as PortalItemType) || '')}
          />
          <Select
            placeholder="All Access"
            clearable
            data={SHARING_OPTIONS}
            value={sharingFilter || null}
            onChange={(v) => setSharingFilter((v as PortalSharing) || '')}
          />
        </Group>

        {error && (
          <Text size="sm" c="red.4" ta="center">
            {error}
          </Text>
        )}

        {needsSignIn && (
          <Text size="sm" c="dimmed" py="lg" ta="center" data-testid="portal-signin">
            Sign in to browse the catalog.
          </Text>
        )}

        {items.length === 0 ? (
          !needsSignIn && (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              No items found. Add your first item to get started.
            </Text>
          )
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
            {items.map((item) => (
              <Card
                key={item.id}
                padding="sm"
                radius="md"
                withBorder
                style={{ cursor: 'pointer', background: 'var(--mantine-color-dark-7)', borderColor: 'var(--mantine-color-dark-5)' }}
                onClick={() => openPortalItem(item)}
              >
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Badge size="xs" color="violet" variant="light">
                    {item.type}
                  </Badge>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    aria-label="Delete item"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(item.id);
                    }}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
                <Text size="sm" fw={600} c="white" lineClamp={1}>
                  {item.title}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {item.description}
                </Text>
                <Group justify="space-between" mt={6}>
                  <Text size="xs" c="gray.5">
                    {item.owner || 'Unknown'}
                  </Text>
                  <Text size="xs" c="gray.6">
                    {item.sharing}
                  </Text>
                </Group>
                {item.tags && item.tags.length > 0 && (
                  <Group gap={4} mt={4}>
                    {item.tags.map((t) => (
                      <Badge key={t} size="xs" variant="outline" color="gray">
                        {t}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Card>
            ))}
          </SimpleGrid>
        )}

        {adding && (
          <Box p="sm" style={{ border: '1px solid var(--mantine-color-dark-5)', borderRadius: 8 }}>
            <Stack gap="xs">
              <TextInput
                label="Title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
              />
              <Group grow>
                <Select
                  label="Type"
                  data={TYPE_OPTIONS}
                  value={form.type}
                  onChange={(v) => setForm({ ...form, type: (v as PortalItemType) || 'map' })}
                />
                <Select
                  label="Sharing"
                  data={SHARING_OPTIONS}
                  value={form.sharing}
                  onChange={(v) =>
                    setForm({ ...form, sharing: (v as PortalSharing) || 'private' })
                  }
                />
              </Group>
              <Textarea
                label="Description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
              />
              <TextInput
                label="Tags (comma-separated)"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.currentTarget.value })}
              />
              <Group justify="flex-end">
                <Button variant="subtle" color="gray" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button color="violet" onClick={submitAdd}>
                  Add
                </Button>
              </Group>
            </Stack>
          </Box>
        )}

        <Group justify="space-between">
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAdding((a) => !a)}
          >
            Add Item
          </Button>
          <Text size="xs" c="dimmed">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </Text>
        </Group>
      </Stack>
    </Modal>
  );
}
