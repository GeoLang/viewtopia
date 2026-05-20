import {
  MantineProvider,
  AppShell,
  Box,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { IconMenu2 } from '@tabler/icons-react';
import { useAppStore } from './store/app';
import { theme } from './theme';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { ViewerToolbar } from './components/ViewerToolbar';
import { ViewerArea } from './components/ViewerArea';
import { SpaceTimePanel } from './features/spacetime/SpaceTimePanel';
import { ToolPanels } from './components/ToolPanels';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useBackendDiscovery } from './hooks/useBackendDiscovery';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSpaceTimeStore } from './features/spacetime/store';
import { useCallback, useRef, useEffect } from 'react';
import { initNetworkMonitor } from './offline/network';
import { initSync } from './offline/sync';

export function App() {
  const navOpened = useAppStore((s) => s.navOpened);
  const asideWidth = useAppStore((s) => s.asideWidth);
  const setAsideWidth = useAppStore((s) => s.setAsideWidth);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);

  // Initialize offline-first system
  useEffect(() => {
    initNetworkMonitor();
    initSync();
  }, []);

  useBackendDiscovery();
  useKeyboardShortcuts({
    'ctrl+b': toggleNav,
    'b': toggleNav,
    't': toggleSpaceTime,
  });

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: asideWidth };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = dragRef.current.startX - ev.clientX;
        setAsideWidth(dragRef.current.startWidth + dx);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        dragRef.current = null;
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [asideWidth, setAsideWidth],
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <ModalsProvider>
        <AppShell
          header={{ height: 48 }}
          aside={{
            width: asideWidth,
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

          <AppShell.Aside
            style={{ background: '#161b22', borderColor: '#30363d' }}
          >
            <Box
              onMouseDown={onResizeMouseDown}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 5,
                cursor: 'col-resize',
                zIndex: 10,
                background: 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#7c3aed'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            />
            <ChatPanel />
          </AppShell.Aside>

          {/* Floating chat toggle button */}
          <Tooltip label={navOpened ? 'Hide chat (Ctrl+B)' : 'Show chat (Ctrl+B)'} position="left">
            <ActionIcon
              variant="filled"
              color="violet"
              size="lg"
              radius="xl"
              onClick={toggleNav}
              style={{
                position: 'fixed',
                top: 56,
                right: 8,
                zIndex: 400,
              }}
            >
              <IconMenu2 size={18} />
            </ActionIcon>
          </Tooltip>

          <AppShell.Main
            style={{
              background: '#0d1117',
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 48px)',
              position: 'relative',
            }}
          >
            <ViewerToolbar />
            <ErrorBoundary fallbackMessage="Map viewer encountered an error">
              <ViewerArea />
            </ErrorBoundary>
            <ErrorBoundary fallbackMessage="SpaceTime panel error">
              <SpaceTimePanel />
            </ErrorBoundary>
            <ToolPanels />
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}

