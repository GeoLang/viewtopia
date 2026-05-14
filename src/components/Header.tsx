import {
  Group,
  ActionIcon,
  Title,
  Badge,
  Select,
  TextInput,
  Button,
  Tooltip,
} from '@mantine/core';
import {
  IconGlobe,
  IconMenu2,
  IconMoon,
  IconSun,
  IconKey,
} from '@tabler/icons-react';
import { useMantineColorScheme } from '@mantine/core';
import { useAppStore } from '../store/app';

export function Header() {
  const { toggleNav, tiletopiaOnline, geolangOnline } = useAppStore();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap">
        <ActionIcon variant="subtle" color="gray" onClick={toggleNav}>
          <IconMenu2 size={18} />
        </ActionIcon>
        <IconGlobe size={20} color="#a78bfa" />
        <Title order={4} c="white" fw={600} visibleFrom="xs">
          ViewTopia
        </Title>
      </Group>

      <Group gap="xs" wrap="nowrap">
        {tiletopiaOnline && (
          <Badge variant="dot" color="green" size="xs">
            TileTopia
          </Badge>
        )}
        {geolangOnline && (
          <Badge variant="dot" color="green" size="xs">
            GeoLang
          </Badge>
        )}
      </Group>

      <Group gap="xs" wrap="nowrap">
        <Select
          size="xs"
          w={120}
          data={[{ value: 'default', label: 'Session 1' }]}
          defaultValue="default"
          styles={{
            input: { background: '#161b22', borderColor: '#30363d' },
          }}
        />
        <TextInput
          size="xs"
          placeholder="Session name…"
          w={130}
          styles={{
            input: { background: '#161b22', borderColor: '#30363d' },
          }}
        />
        <Button size="xs" variant="subtle" color="violet">
          + New
        </Button>

        <Tooltip label="Toggle theme">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={toggleColorScheme}
          >
            {colorScheme === 'dark' ? (
              <IconSun size={16} />
            ) : (
              <IconMoon size={16} />
            )}
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Login / Account">
          <ActionIcon variant="subtle" color="gray">
            <IconKey size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
