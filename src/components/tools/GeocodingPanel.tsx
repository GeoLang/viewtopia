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
import { geocode, type GeoHit } from '../../services/geocode';

interface GeocodingPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
}

export function GeocodingPanel({ onFlyTo, onClose }: GeocodingPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoHit[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResults(await geocode(query, 8));
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
          {results.map((r, i) => (
            <Group
              key={`${r.lat},${r.lng},${i}`}
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
    </Paper>
  );
}
