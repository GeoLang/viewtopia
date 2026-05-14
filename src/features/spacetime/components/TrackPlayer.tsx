import {
  Stack,
  Group,
  Text,
  ActionIcon,
  Slider,
  Badge,
  Select,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import { useSpaceTimeStore } from '../store';

export function TrackPlayer() {
  const {
    timeRange,
    currentTime,
    playing,
    trailDuration,
    playbackSpeed,
    setCurrentTime,
    setPlaying,
    setTrailDuration,
    setPlaybackSpeed,
    tracks,
  } = useSpaceTimeStore();

  const hasData = timeRange.max > timeRange.min;

  const formatTime = (t: number) => {
    if (!t) return '--:--';
    return new Date(t).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Stack gap="xs">
      {!hasData ? (
        <Text c="dimmed" size="xs" ta="center" py="md">
          Import track data to use the timeline player
        </Text>
      ) : (
        <>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {formatTime(timeRange.min)}
            </Text>
            <Badge size="xs" variant="light" color="violet">
              {formatTime(currentTime)}
            </Badge>
            <Text size="xs" c="dimmed">
              {formatTime(timeRange.max)}
            </Text>
          </Group>

          <Slider
            size="sm"
            min={timeRange.min}
            max={timeRange.max}
            value={currentTime}
            onChange={setCurrentTime}
            label={(v) => formatTime(v)}
            color="violet"
          />

          <Group justify="center" gap="xs">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => setCurrentTime(timeRange.min)}
            >
              <IconPlayerSkipBack size={14} />
            </ActionIcon>
            <ActionIcon
              size="md"
              variant="filled"
              color="violet"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? (
                <IconPlayerPause size={16} />
              ) : (
                <IconPlayerPlay size={16} />
              )}
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => setCurrentTime(timeRange.max)}
            >
              <IconPlayerSkipForward size={14} />
            </ActionIcon>
          </Group>

          <Group gap="xs">
            <Text size="xs" c="dimmed" w={40}>
              Speed
            </Text>
            <Select
              size="xs"
              w={80}
              data={['0.5x', '1x', '2x', '5x', '10x']}
              value={`${playbackSpeed}x`}
              onChange={(v) => v && setPlaybackSpeed(parseFloat(v))}
              styles={{
                input: { background: '#0d1117', borderColor: '#30363d' },
              }}
            />
            <Text size="xs" c="dimmed" w={30}>
              Trail
            </Text>
            <Select
              size="xs"
              w={80}
              data={[
                { value: '900000', label: '15m' },
                { value: '3600000', label: '1h' },
                { value: '14400000', label: '4h' },
                { value: '86400000', label: '24h' },
              ]}
              value={String(trailDuration)}
              onChange={(v) => v && setTrailDuration(parseInt(v))}
              styles={{
                input: { background: '#0d1117', borderColor: '#30363d' },
              }}
            />
          </Group>

          <Text size="xs" c="dimmed" ta="center">
            {tracks.length} tracks loaded
          </Text>
        </>
      )}
    </Stack>
  );
}
