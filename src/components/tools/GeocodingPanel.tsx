import { useState } from 'react';
import {
  Text,
  Stack,
  Group,
  TextInput,
  Button,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconSearch, IconMapPin } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PanelCard, PanelHeader } from '../PanelCard';
import { PanelEmptyState, PanelSkeleton } from '../PanelStates';
import { geocode, type GeoHit } from '../../services/geocode';

interface GeocodingPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
}

export function GeocodingPanel({ onFlyTo, onClose }: GeocodingPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResults(await geocode(query, 8));
      setSearched(true);
    } catch (err) {
      setResults([]);
      notifications.show({
        title: 'Place search failed',
        message: err instanceof Error ? err.message : 'geocoding service unreachable',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <PanelCard width={400} anchor="center" maxHeight="50vh">
      <PanelHeader
        icon={<IconSearch size={16} />}
        title="Search Places"
        onClose={onClose}
      />

      <Group gap="xs" mb="xs">
        <TextInput
          size="xs"
          flex={1}
          placeholder="Search for a place…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button size="xs" color="violet" onClick={handleSearch} loading={loading}>
          Go
        </Button>
      </Group>

      <ScrollArea flex={1}>
        {loading && <PanelSkeleton rows={4} />}
        {!loading && searched && results.length === 0 && (
          <PanelEmptyState
            message={`No places found for “${query}”.`}
            actionLabel="Clear search"
            onAction={clearSearch}
          />
        )}
        <Stack gap={4}>
          {!loading && results.map((r, i) => (
            <Group
              key={`${r.lat},${r.lng},${i}`}
              p="xs"
              style={{
                background: 'var(--mantine-color-dark-6)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onClick={() => onFlyTo(r.lat, r.lng, 12)}
              wrap="nowrap"
            >
              <IconMapPin size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />
              <Stack gap={0} flex={1}>
                <Text size="xs" c="white" lineClamp={1}>
                  {r.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                </Text>
              </Stack>
              <Badge size="xs" variant="light" color="gray">
                {r.type}
              </Badge>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
