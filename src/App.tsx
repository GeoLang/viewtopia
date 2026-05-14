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

export function App() {
  const navOpened = useAppStore((s) => s.navOpened);

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
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}

