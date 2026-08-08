import { useEffect, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Textarea,
  Button,
  NumberInput,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { IconBook, IconPlus, IconPlayerPlay, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getSharedCamera } from '../../hooks/sharedCamera';
import { captureCameraState, flyToCameraState, type CameraState } from '../../store/cameraViews';
import { useAccessibilityStore } from '../../store/accessibility';

interface StoryStep {
  id: string;
  title: string;
  description: string;
  camera: CameraState;
}

const STORAGE_KEY = 'viewtopia-stories';

function loadSteps(): StoryStep[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoryStep[]) : [];
  } catch {
    return [];
  }
}

function sharedAsCamera(): CameraState {
  const cam = getSharedCamera();
  return {
    lng: cam.longitude,
    lat: cam.latitude,
    height: 4e7 / 2 ** cam.zoom,
    heading: cam.bearing,
    pitch: cam.pitch - 90,
    roll: 0,
  };
}

export function StoriesPanel({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<StoryStep[]>(loadSteps);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dwellSec, setDwellSec] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const playRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
  }, [steps]);

  useEffect(() => () => {
    playRef.current = false;
  }, []);

  const handleAddStep = () => {
    if (!title.trim()) return;
    const viewer = getActiveCesiumViewer();
    const camera = (viewer && captureCameraState(viewer)) || sharedAsCamera();
    setSteps((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), camera },
    ]);
    setTitle('');
    setDescription('');
  };

  const play = async () => {
    if (steps.length === 0) return;
    playRef.current = true;
    setPlaying(true);
    const viewer = getActiveCesiumViewer();
    for (let i = 0; i < steps.length; i++) {
      if (!playRef.current) break;
      setCurrent(i);
      if (viewer) flyToCameraState(viewer, steps[i].camera, { reduceMotion });
      await new Promise((r) => setTimeout(r, Math.max(200, dwellSec * 1000)));
    }
    playRef.current = false;
    setPlaying(false);
    setCurrent(-1);
  };

  const stop = () => {
    playRef.current = false;
    setPlaying(false);
    setCurrent(-1);
  };

  return (
    <PanelCard width={300} maxHeight="60vh">
      <PanelHeader
        icon={<IconBook size={16} />}
        title="Stories"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet" data-testid="stories-count">
            {steps.length} steps
          </Badge>
        }
      />

      <Stack gap="xs" mb="xs">
        <TextInput
          size="xs"
          placeholder="Step title…"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <Textarea
          size="xs"
          placeholder="Caption…"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="subtle"
            color="violet"
            leftSection={<IconPlus size={14} />}
            onClick={handleAddStep}
            disabled={!title.trim()}
            flex={1}
          >
            Add step at view
          </Button>
          <NumberInput
            size="xs"
            w={78}
            min={0.2}
            step={0.5}
            value={dwellSec}
            onChange={(v) => setDwellSec(typeof v === 'number' ? v : 3)}
            suffix="s"
          />
        </Group>
      </Stack>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {steps.map((step, i) => (
            <Group
              key={step.id}
              justify="space-between"
              p="xs"
              style={{
                background: i === current ? '#2d2140' : 'var(--mantine-color-dark-6)',
                borderRadius: 4,
              }}
            >
              <div>
                <Text size="xs" c="white" fw={500}>
                  {i + 1}. {step.title}
                </Text>
                {step.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {step.description}
                  </Text>
                )}
              </div>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => setSteps((p) => p.filter((s) => s.id !== step.id))}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>

      {steps.length > 0 && (
        <Button
          size="xs"
          variant="filled"
          color={playing ? 'red' : 'violet'}
          leftSection={playing ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
          onClick={playing ? stop : play}
          mt="xs"
          fullWidth
          data-testid="stories-play"
        >
          {playing ? 'Stop Story' : 'Play Story'}
        </Button>
      )}
    </PanelCard>
  );
}
