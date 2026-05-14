import {
  MantineProvider,
  AppShell,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { useAppStore } from './store/app';
import { theme } from './theme';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { ViewerToolbar } from './components/ViewerToolbar';
import { ViewerArea } from './components/ViewerArea';
import { SpaceTimePanel } from './features/spacetime/SpaceTimePanel';
import { useBackendDiscovery } from './hooks/useBackendDiscovery';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSpaceTimeStore } from './features/spacetime/store';

export function App() {
  const navOpened = useAppStore((s) => s.navOpened);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);

  useBackendDiscovery();
  useKeyboardShortcuts({
    'b': toggleNav,
    't': toggleSpaceTime,
  });

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
            <Header />
          </AppShell.Header>

          <AppShell.Navbar
            style={{ background: '#161b22', borderColor: '#30363d' }}
          >
            <ChatPanel />
          </AppShell.Navbar>

          <AppShell.Main
            style={{
              background: '#0d1117',
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 48px)',
            }}
          >
            <ViewerToolbar />
            <ViewerArea />
            <SpaceTimePanel />
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}

