import { Box, Text, Group } from '@mantine/core';
import { useAppStore } from '../store/app';

export function CoordReadout() {
  const cursorCoords = useAppStore((s) => s.cursorCoords);
  const settings = useAppStore((s) => s.settings);

  if (!settings.showCoordReadout || !cursorCoords) return null;

  const { lat, lng, elevation } = cursorCoords;

  return (
    <Box
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'rgba(13, 17, 23, 0.9)',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '4px 10px',
        zIndex: 200,
        pointerEvents: 'none',
      }}
    >
      <Group gap="sm">
        <Text size="xs" c="dimmed" ff="monospace">
          {lat >= 0 ? lat.toFixed(6) + '°N' : (-lat).toFixed(6) + '°S'}
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {lng >= 0 ? lng.toFixed(6) + '°E' : (-lng).toFixed(6) + '°W'}
        </Text>
        {elevation !== undefined && (
          <Text size="xs" c="dimmed" ff="monospace">
            {elevation.toFixed(1)}m
          </Text>
        )}
      </Group>
    </Box>
  );
}
