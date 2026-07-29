import {
  MantineProvider,
  AppShell,
  Box,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { useMediaQuery } from '@mantine/hooks';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { useAppStore } from './store/app';
import { theme, MOBILE_QUERY } from './theme';
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
import { useCallback, useRef, useEffect, useState } from 'react';
import { initNetworkMonitor } from './offline/network';
import { initSync } from './offline/sync';

const MOBILE_SHEET_HEIGHT = '45vh';

export function App() {
  const navOpened = useAppStore((s) => s.navOpened);
  const asideWidth = useAppStore((s) => s.asideWidth);
  const setAsideWidth = useAppStore((s) => s.setAsideWidth);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const toggleSpaceTime = useSpaceTimeStore((s) => s.togglePanel);

  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });
  // phones get their own chat flag so the persisted desktop width and open
  // state don't leave the map as a sliver on first load
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const chatOpen = isMobile ? mobileChatOpen : navOpened;
  const toggleChat = useCallback(() => {
    if (isMobile) setMobileChatOpen((o) => !o);
    else toggleNav();
  }, [isMobile, toggleNav]);

  // Initialize offline-first system
  useEffect(() => {
    initNetworkMonitor();
    initSync();
  }, []);

  useBackendDiscovery();
  useKeyboardShortcuts({
    'ctrl+b': toggleChat,
    'b': toggleChat,
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
            width: isMobile ? '100vw' : asideWidth,
            breakpoint: 'sm',
            collapsed: { mobile: !mobileChatOpen, desktop: !navOpened },
          }}
          padding={0}
        >
          <AppShell.Header
            style={{ background: '#0d1117', borderColor: '#30363d' }}
          >
            <Header />
          </AppShell.Header>

          <AppShell.Aside
            style={{
              background: '#161b22',
              borderColor: '#30363d',
              // phone: a bottom sheet, so the map stays visible above the chat.
              // the explicit transform overrides Mantine's slide-out-right.
              ...(isMobile && {
                top: 'auto',
                bottom: 0,
                insetInlineStart: 0,
                height: MOBILE_SHEET_HEIGHT,
                borderTop: '1px solid #30363d',
                transform: mobileChatOpen ? 'translateY(0)' : 'translateY(100%)',
              }),
            }}
          >
            {!isMobile && (
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
            )}
            <ChatPanel />
          </AppShell.Aside>

          {/* Floating chat toggle button */}
          <Tooltip label={chatOpen ? 'Hide chat (Ctrl+B)' : 'Show chat (Ctrl+B)'} position="left">
            <ActionIcon
              aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
              variant="filled"
              color="violet"
              size="lg"
              radius="xl"
              onClick={toggleChat}
              style={{
                position: 'fixed',
                // on phones it rides just above the sheet so it never covers chat
                ...(isMobile
                  ? {
                      bottom: mobileChatOpen
                        ? `calc(${MOBILE_SHEET_HEIGHT} + 12px)`
                        : 24,
                      right: 12,
                    }
                  : { top: 56, right: 8 }),
                zIndex: 400,
              }}
            >
              {isMobile && chatOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
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

