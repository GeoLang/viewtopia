import { useEffect, useRef, useState, useCallback } from 'react';
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
  const timeRange = useSpaceTimeStore((s) => s.timeRange);
  const playing = useSpaceTimeStore((s) => s.playing);
  const trailDuration = useSpaceTimeStore((s) => s.trailDuration);
  const playbackSpeed = useSpaceTimeStore((s) => s.playbackSpeed);
  const tracks = useSpaceTimeStore((s) => s.tracks);
  const setCurrentTime = useSpaceTimeStore((s) => s.setCurrentTime);
  const setPlaying = useSpaceTimeStore((s) => s.setPlaying);
  const setTrailDuration = useSpaceTimeStore((s) => s.setTrailDuration);
  const setPlaybackSpeed = useSpaceTimeStore((s) => s.setPlaybackSpeed);

  // Local display state — updated at throttled rate to avoid 60fps re-renders
  const [displayTime, setDisplayTime] = useState(0);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastDisplayRef = useRef<number>(0);

  // Sync display when not playing
  useEffect(() => {
    if (!playing) {
      setDisplayTime(useSpaceTimeStore.getState().currentTime);
    }
  }, [playing]);

  // Animation loop: advance currentTime while playing
  useEffect(() => {
    if (!playing || timeRange.max <= timeRange.min) return;

    lastFrameRef.current = performance.now();
    lastDisplayRef.current = 0;

    const frame = (now: number) => {
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      const advance = dt * playbackSpeed * 60;
      const cur = useSpaceTimeStore.getState().currentTime;
      const next = cur + advance > timeRange.max ? timeRange.min : cur + advance;
      setCurrentTime(next);

      // Throttle display updates to ~10fps to avoid React churn
      if (now - lastDisplayRef.current > 100) {
        lastDisplayRef.current = now;
        setDisplayTime(next);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, playbackSpeed, timeRange, setCurrentTime]);

  const handleSliderChange = useCallback((v: number) => {
    setCurrentTime(v);
    setDisplayTime(v);
  }, [setCurrentTime]);

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
              {formatTime(displayTime)}
            </Badge>
            <Text size="xs" c="dimmed">
              {formatTime(timeRange.max)}
            </Text>
          </Group>

          <Slider
            size="sm"
            min={timeRange.min}
            max={timeRange.max}
            value={displayTime}
            onChange={handleSliderChange}
            label={(v) => formatTime(v)}
            color="violet"
          />

          <Group justify="center" gap="xs">
            <ActionIcon aria-label="Skip to start"
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => handleSliderChange(timeRange.min)}
            >
              <IconPlayerSkipBack size={14} />
            </ActionIcon>
            <ActionIcon aria-label={playing ? 'Pause track' : 'Play track'}
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
            <ActionIcon aria-label="Skip to end"
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => handleSliderChange(timeRange.max)}
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
