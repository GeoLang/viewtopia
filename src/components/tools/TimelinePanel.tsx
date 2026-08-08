import { useEffect, useState } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Slider,
  Box,
  Button,
} from '@mantine/core';
import {
  IconTimeline,
  IconX,
  IconPlayerPlay,
  IconPlayerPause,
  IconZoomScan,
} from '@tabler/icons-react';
import { ClockRange, JulianDate } from 'cesium';
import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAppStore } from '../../store/app';

function fmt(jd: JulianDate): string {
  return JulianDate.toDate(jd).toLocaleString();
}

function clockFraction(viewer: Viewer): number {
  const { startTime, stopTime, currentTime } = viewer.clock;
  const total = JulianDate.secondsDifference(stopTime, startTime);
  if (total <= 0) return 0;
  const f = JulianDate.secondsDifference(currentTime, startTime) / total;
  return Math.min(1, Math.max(0, f));
}

/** widen a zero-length clock range to a 24h window so playback has room to move */
function ensureRange(viewer: Viewer): void {
  const { startTime, stopTime, currentTime } = viewer.clock;
  if (JulianDate.secondsDifference(stopTime, startTime) > 0) return;
  viewer.clock.startTime = JulianDate.addHours(currentTime, -12, new JulianDate());
  viewer.clock.stopTime = JulianDate.addHours(currentTime, 12, new JulianDate());
}

/** shrink-wrap the clock range onto the loaded time-dynamic data, if any */
function fitClockToData(viewer: Viewer): boolean {
  let min: JulianDate | null = null;
  let max: JulianDate | null = null;
  const extend = (start?: JulianDate, stop?: JulianDate) => {
    if (start && (!min || JulianDate.lessThan(start, min))) min = start;
    if (stop && (!max || JulianDate.greaterThan(stop, max))) max = stop;
  };
  for (let i = 0; i < viewer.dataSources.length; i++) {
    const ds = viewer.dataSources.get(i);
    if (ds.clock) extend(ds.clock.startTime, ds.clock.stopTime);
    for (const entity of ds.entities.values) {
      const avail = entity.availability;
      if (avail && avail.length > 0) extend(avail.start, avail.stop);
    }
  }
  if (!min || !max || JulianDate.secondsDifference(max, min) <= 0) return false;
  viewer.clock.startTime = min;
  viewer.clock.stopTime = max;
  viewer.clock.currentTime = min;
  return true;
}

export function TimelinePanel({ onClose }: { onClose: () => void }) {
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState(() => getActiveCesiumViewer());
  const [playing, setPlaying] = useState(viewer?.clock.shouldAnimate ?? false);
  const [multiplier, setMultiplier] = useState(viewer?.clock.multiplier ?? 1);
  const [fraction, setFraction] = useState(viewer ? clockFraction(viewer) : 0);
  const [currentLabel, setCurrentLabel] = useState(viewer ? fmt(viewer.clock.currentTime) : '');
  const [fitStatus, setFitStatus] = useState<string | null>(null);

  // re-acquire on renderer switches: the cesium viewer is destroyed and a new
  // one registers in an effect after this re-render, so retry briefly
  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  // mirror the live clock while it animates (external system sync)
  useEffect(() => {
    if (!viewer) return;
    ensureRange(viewer);
    // loop inside the range instead of running off the end
    viewer.clock.clockRange = ClockRange.LOOP_STOP;
    let lastUpdate = 0;
    const onTick = () => {
      const now = Date.now();
      if (now - lastUpdate < 200) return;
      lastUpdate = now;
      setFraction(clockFraction(viewer));
      setCurrentLabel(fmt(viewer.clock.currentTime));
      setPlaying(viewer.clock.shouldAnimate);
    };
    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      if (!viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(onTick);
    };
  }, [viewer]);

  if (!viewer) {
    return (
      <Paper
        shadow="xl"
        radius="md"
        p="sm"
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          maxWidth: 700,
          background: 'var(--mantine-color-dark-7)',
          border: '1px solid var(--mantine-color-dark-5)',
          zIndex: 300,
        }}
      >
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Timeline needs the Cesium globe. Switch to the CesiumJS renderer.
          </Text>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Paper>
    );
  }

  const seek = (f: number) => {
    const total = JulianDate.secondsDifference(viewer.clock.stopTime, viewer.clock.startTime);
    viewer.clock.currentTime = JulianDate.addSeconds(
      viewer.clock.startTime,
      total * f,
      new JulianDate(),
    );
    setFraction(f);
    setCurrentLabel(fmt(viewer.clock.currentTime));
  };

  const togglePlay = () => {
    viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
    setPlaying(viewer.clock.shouldAnimate);
  };

  const setSpeed = (m: number) => {
    viewer.clock.multiplier = m;
    setMultiplier(m);
  };

  const fitToData = () => {
    const fitted = fitClockToData(viewer);
    setFitStatus(fitted ? null : 'No time-dynamic data loaded; keeping current range');
    setFraction(clockFraction(viewer));
    setCurrentLabel(fmt(viewer.clock.currentTime));
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 700,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconTimeline size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            Timeline
          </Text>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="violet.3" data-testid="timeline-current">
            {currentLabel}
          </Text>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <Box mb="xs">
        <Slider
          size="sm"
          min={0}
          max={1}
          step={0.001}
          value={fraction}
          onChange={seek}
          color="violet"
          label={null}
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">{fmt(viewer.clock.startTime)}</Text>
          <Text size="xs" c="dimmed">{fmt(viewer.clock.stopTime)}</Text>
        </Group>
      </Box>

      <Group gap="xs" justify="center">
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          onClick={() => setSpeed(Math.max(0.25, multiplier / 2))}
        >
          ½×
        </Button>
        <Button
          size="xs"
          variant="filled"
          color="violet"
          leftSection={playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={togglePlay}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          onClick={() => setSpeed(Math.min(86400, multiplier * 2))}
        >
          2×
        </Button>
        <Text size="xs" c="dimmed">
          Speed: {multiplier}×
        </Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconZoomScan size={14} />}
          onClick={fitToData}
        >
          Fit to Data
        </Button>
        {fitStatus && (
          <Text size="xs" c="dimmed">
            {fitStatus}
          </Text>
        )}
      </Group>
    </Paper>
  );
}
