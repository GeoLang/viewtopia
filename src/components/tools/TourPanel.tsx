import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Group,
  ActionIcon,
  Button,
  Badge,
} from '@mantine/core';
import { IconInfoCircle, IconX, IconArrowRight } from '@tabler/icons-react';

interface TourStep {
  target: string;
  title: string;
  content: string;
}

const TOUR_STEPS: TourStep[] = [
  { target: '.mantine-AppShell-header', title: 'Welcome to ViewTopia', content: 'This is your geospatial viewer. Let\'s take a quick tour!' },
  { target: '.mantine-Tabs-list', title: 'Viewer Tabs', content: 'Switch between the 3D Globe and 2D Map views.' },
  { target: '#cesium-container', title: '3D Globe', content: 'Explore the world in 3D with CesiumJS, deck.gl, or MapLibre.' },
  { target: '.mantine-AppShell-aside', title: 'Chat Panel', content: 'Ask the AI agent to analyze data, fly to locations, or load layers.' },
  { target: '.mantine-Menu-dropdown', title: 'Analysis Tools', content: 'Access analysis, simulation, and utility tools from the toolbar.' },
];

export function TourPanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  const current = TOUR_STEPS[step];

  useEffect(() => {
    const el = document.querySelector(current.target);
    if (el) {
      (el as HTMLElement).style.outline = '2px solid var(--mantine-color-violet-4)';
      (el as HTMLElement).style.outlineOffset = '2px';
      return () => {
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).style.outlineOffset = '';
      };
    }
  }, [current.target]);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 360,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 500,
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
        <ActionIcon aria-label="Close tour" size="sm" variant="subtle" color="gray" onClick={onClose}>
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
          <Button size="xs" variant="filled" color="violet" onClick={onClose}>
            Finish
          </Button>
        )}
      </Group>
    </Paper>
  );
}
