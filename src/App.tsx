import {
  MantineProvider,
  createTheme,
  AppShell,
  Group,
  Title,
  Badge,
  ActionIcon,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { IconGlobe, IconMenu2 } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

const theme = createTheme({
  primaryColor: 'violet',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  colors: {
    dark: [
      '#c9d1d9',
      '#b0b8c1',
      '#8b949e',
      '#6e7681',
      '#484f58',
      '#30363d',
      '#21262d',
      '#161b22',
      '#0d1117',
      '#010409',
    ],
  },
});

export function App() {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true);

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <ModalsProvider>
        <AppShell
          header={{ height: 48 }}
          navbar={{
            width: 340,
            breakpoint: 'sm',
            collapsed: { mobile: !navOpened, desktop: !navOpened },
          }}
          padding={0}
        >
          <AppShell.Header
            style={{ background: '#0d1117', borderColor: '#30363d' }}
          >
            <Group h="100%" px="md" justify="space-between">
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={toggleNav}
                >
                  <IconMenu2 size={18} />
                </ActionIcon>
                <IconGlobe size={20} color="#a78bfa" />
                <Title order={4} c="white" fw={600}>
                  ViewTopia
                </Title>
              </Group>
              <Group gap="xs">
                <Badge variant="dot" color="green" size="sm">
                  React 19
                </Badge>
                <Badge variant="dot" color="violet" size="sm">
                  Mantine 7
                </Badge>
              </Group>
            </Group>
          </AppShell.Header>

          <AppShell.Navbar
            style={{ background: '#161b22', borderColor: '#30363d' }}
          >
            {/* Chat panel will go here */}
            <AppShell.Section grow p="sm">
              <Title order={5} c="dimmed" mb="sm">
                Chat (coming soon)
              </Title>
            </AppShell.Section>
          </AppShell.Navbar>

          <AppShell.Main style={{ background: '#0d1117' }}>
            {/* Map viewers will go here */}
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}
