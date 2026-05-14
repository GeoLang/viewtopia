import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconSearch, IconX, IconMapPin } from '@tabler/icons-react';

interface SearchResult {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
}

interface GeocodingPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
}

export function GeocodingPanel({ onFlyTo, onClose }: GeocodingPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`,
      );
      const data = await res.json();
      setResults(
        data.map((item: Record<string, string>) => ({
          placeId: item.place_id,
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type,
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 400,
        maxHeight: '50vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSearch size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Search Places
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Group gap="xs" mb="xs">
        <TextInput
          size="xs"
          flex={1}
          placeholder="Search for a place…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          styles={{
            input: { background: '#0d1117', borderColor: '#30363d' },
          }}
        />
        <Button size="xs" color="violet" onClick={handleSearch} loading={loading}>
          Go
        </Button>
      </Group>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {results.map((r) => (
            <Group
              key={r.placeId}
              p="xs"
              style={{
                background: '#21262d',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onClick={() => onFlyTo(r.lat, r.lng, 12)}
              wrap="nowrap"
            >
              <IconMapPin size={14} color="#a78bfa" />
              <Stack gap={0} flex={1}>
                <Text size="xs" c="white" lineClamp={1}>
                  {r.displayName}
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
    </Paper>
  );
}
