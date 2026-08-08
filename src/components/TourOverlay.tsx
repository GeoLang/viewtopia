import { useEffect, useRef } from 'react';
import { ActionIcon, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconArrowRight, IconInfoCircle, IconX } from '@tabler/icons-react';
import { spotlight } from '@mantine/spotlight';
import { useAppStore, type ToolPanel } from '../store/app';
import { useDrawStore } from '../store/draw';
import { useMeasureStore } from '../store/measure';
import { useTourStore } from '../store/tour';

// above the spotlight modal, so Next stays clickable while the palette is open
const TOUR_Z_INDEX = 10000;

interface TourStep {
  title: string;
  content: string;
  /** element the violet outline lands on */
  target?: string;
  /** drives the app when the step becomes current */
  enter?: () => void;
  /** undoes enter when the step is left in either direction */
  exit?: () => void;
}

const openPanel = (panel: ToolPanel) => useAppStore.getState().setActivePanel(panel);

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to ViewTopia',
    content:
      'This is your collaborative map studio. This tour drives the app for real: each step opens the tool it talks about.',
    target: '.mantine-AppShell-header',
    enter: () => openPanel(null),
  },
  {
    title: 'Command Palette',
    content:
      'Ctrl+K (Cmd+K on a Mac) opens every tool, panel and plugin from the keyboard. It is open now — type to filter it.',
    enter: () => spotlight.open(),
    exit: () => spotlight.close(),
  },
  {
    title: 'Draw',
    content:
      'The draw panel is open and the line tool is armed — click the map a few times, double-click to finish. The one-letter keys P, L, G, C and R arm these tools from anywhere.',
    target: '.panel-dock',
    enter: () => {
      openPanel('draw');
      useDrawStore.getState().setMode('line');
    },
    exit: () => useDrawStore.getState().setMode(null),
  },
  {
    title: 'Measure',
    content:
      'Distance measuring is armed (M anytime, A for area). Click points on the map and the running total updates live.',
    target: '.panel-dock',
    enter: () => {
      openPanel('measure');
      useMeasureStore.getState().setMode('distance');
    },
    exit: () => useMeasureStore.getState().setMode(null),
  },
  {
    title: 'Layers',
    content:
      'Everything you import or the agent builds lands in this panel. Drop a file anywhere on the window to add your own data — GeoJSON, KML, CSV, GeoPackage, Shapefile and more.',
    target: '.panel-dock',
    enter: () => openPanel('layers'),
  },
  {
    title: 'Basemap & Renderer',
    content:
      'This corner control just opened itself: pick any basemap, or swap the engine — CesiumJS for the 3D globe, MapLibre for fast vector maps. Advancing closes it again.',
    target: '[aria-label="Basemap & renderer"]',
    enter: () => {
      openPanel(null);
      // the popover is uncontrolled, so drive it the way a user would
      document.querySelector<HTMLElement>('[aria-label="Basemap & renderer"]')?.click();
    },
  },
  {
    title: 'Make It Yours',
    content:
      'Start a Live session from the header to edit the same map with your team, and share view-only links when it is ready. That is the tour — Ctrl+K whenever you need anything.',
    target: '.mantine-AppShell-header',
    enter: () => openPanel(null),
  },
];

const HIGHLIGHT_RETRY_MS = 100;
const HIGHLIGHT_RETRIES = 10;

/** Starts the tour from the More menu's panel entry, then frees the panel slot. */
export function TourLauncher({ onClose }: { onClose: () => void }) {
  const start = useTourStore((s) => s.start);
  useEffect(() => {
    start();
    onClose();
  }, [start, onClose]);
  return null;
}

export function TourOverlay() {
  const step = useTourStore((s) => s.step);
  const setStep = useTourStore((s) => s.setStep);
  const stop = useTourStore((s) => s.stop);
  const previousStep = useRef<number | null>(null);

  // run exits and enters on step transitions, in both directions
  useEffect(() => {
    if (previousStep.current !== null) TOUR_STEPS[previousStep.current]?.exit?.();
    previousStep.current = step;
    if (step !== null) TOUR_STEPS[step]?.enter?.();
  }, [step]);

  // the target often mounts a frame after enter() opens its panel, so retry
  useEffect(() => {
    if (step === null) return;
    const selector = TOUR_STEPS[step].target;
    if (!selector) return;
    let element: HTMLElement | null = null;
    let tries = 0;
    const timer = setInterval(() => {
      element = document.querySelector<HTMLElement>(selector);
      tries += 1;
      if (element || tries >= HIGHLIGHT_RETRIES) {
        clearInterval(timer);
        if (element) {
          element.style.outline = '2px solid var(--mantine-color-violet-4)';
          element.style.outlineOffset = '2px';
        }
      }
    }, HIGHLIGHT_RETRY_MS);
    return () => {
      clearInterval(timer);
      if (element) {
        element.style.outline = '';
        element.style.outlineOffset = '';
      }
    };
  }, [step]);

  if (step === null) return null;

  const current = TOUR_STEPS[step];
  const finish = () => {
    useAppStore.getState().setActivePanel(null);
    stop();
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      data-testid="tour-card"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 380,
        zIndex: TOUR_Z_INDEX,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconInfoCircle size={16} style={{ color: 'var(--mantine-color-violet-4)' }} />
          <Text size="sm" fw={600} c="white">
            {current.title}
          </Text>
          <Badge size="xs" variant="light" color="violet">
            {step + 1}/{TOUR_STEPS.length}
          </Badge>
        </Group>
        <ActionIcon aria-label="Close tour" size="sm" variant="subtle" color="gray" onClick={finish}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Text size="sm" c="gray.3" mb="md">
        {current.content}
      </Text>

      <Group justify="space-between">
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() => step > 0 && setStep(step - 1)}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < TOUR_STEPS.length - 1 ? (
          <Button
            size="xs"
            variant="filled"
            color="violet"
            rightSection={<IconArrowRight size={14} />}
            onClick={() => setStep(step + 1)}
          >
            Next
          </Button>
        ) : (
          <Button size="xs" variant="filled" color="violet" onClick={finish}>
            Finish
          </Button>
        )}
      </Group>
    </Paper>
  );
}
