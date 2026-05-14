import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
} from '@mantine/core';
import { IconChartAreaLine, IconX } from '@tabler/icons-react';

export function TerrainProfilePanel({ onClose }: { onClose: () => void }) {
  const [drawing, setDrawing] = useState(false);
  const [profile, setProfile] = useState<{ distance: number; elevation: number }[]>([]);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        bottom: 120,
        left: 16,
        right: 16,
        maxWidth: 600,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconChartAreaLine size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Terrain Profile
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {profile.length > 0 ? (
        <Paper p="xs" style={{ background: '#21262d', borderRadius: 4, height: 120 }}>
          <svg width="100%" height="100%" viewBox="0 0 500 100" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2"
              points={profile
                .map(
                  (p, i) =>
                    `${(i / (profile.length - 1)) * 500},${100 - (p.elevation / Math.max(...profile.map((pp) => pp.elevation))) * 90}`,
                )
                .join(' ')}
            />
            <polyline
              fill="rgba(167,139,250,0.15)"
              stroke="none"
              points={`0,100 ${profile
                .map(
                  (p, i) =>
                    `${(i / (profile.length - 1)) * 500},${100 - (p.elevation / Math.max(...profile.map((pp) => pp.elevation))) * 90}`,
                )
                .join(' ')} 500,100`}
            />
          </svg>
        </Paper>
      ) : (
        <Stack gap="xs" align="center" py="sm">
          <Text size="xs" c="dimmed">
            Draw a line on the map to see the elevation profile.
          </Text>
          <Button
            size="xs"
            variant={drawing ? 'light' : 'filled'}
            color="violet"
            onClick={() => setDrawing(!drawing)}
          >
            {drawing ? 'Cancel' : 'Draw Profile Line'}
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
