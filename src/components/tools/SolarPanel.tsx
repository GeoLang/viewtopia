import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Switch,
  Slider,
  NumberInput,
  Button,
} from '@mantine/core';
import { IconSolarPanel, IconX } from '@tabler/icons-react';

export function SolarPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [panelArea, setPanelArea] = useState<number | string>(20);
  const [efficiency, setEfficiency] = useState(18);
  const [tilt, setTilt] = useState(30);

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 270,
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSolarPanel size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Solar Planner
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Switch
          size="xs"
          label="Show Solar Irradiance"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          color="yellow"
        />

        <NumberInput
          size="xs"
          label="Panel Area (m²)"
          value={panelArea}
          onChange={setPanelArea}
          min={1}
          max={1000}
          styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
        />

        <Text size="xs" c="dimmed">Efficiency: {efficiency}%</Text>
        <Slider size="xs" min={10} max={30} value={efficiency} onChange={setEfficiency} color="yellow" />

        <Text size="xs" c="dimmed">Tilt Angle: {tilt}°</Text>
        <Slider size="xs" min={0} max={90} value={tilt} onChange={setTilt} color="yellow" />

        <Button size="xs" variant="filled" color="yellow" fullWidth>
          Calculate Yield
        </Button>
      </Stack>
    </Paper>
  );
}
