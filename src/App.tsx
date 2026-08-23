import {
  MantineProvider,
  AppShell,
  Box,
  Group,
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
import { CommandPalette } from './components/CommandPalette';
import { WindowDropZone } from './components/WindowDropZone';
import { WelcomeCard } from './components/WelcomeCard';
import { FirstRunOverlay } from './onboarding/FirstRunOverlay';
import { TourOverlay } from './components/TourOverlay';
import { ViewerArea } from './components/ViewerArea';
import { SpaceTimePanel } from './features/spacetime/SpaceTimePanel';
import { ToolPanels } from './components/ToolPanels';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useBackendDiscovery } from './hooks/useBackendDiscovery';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { MEASURE_SHORTCUTS, TOOL_SHORTCUTS } from './hooks/toolShortcuts';
import { useViewOnlyLive } from './live/liveStore';
import { useSpaceTimeStore } from './features/spacetime/store';
import { useCallback, useRef, useEffect, useState } from 'react';
import { initNetworkMonitor } from './offline/network';
import { registerAppShellWorker } from './offline/appShellWorker';
import { initSync } from './offline/sync';
import { startDocumentBridge } from './live/documentBridge';
import { useJoinLiveFromLink } from './live/joinFromLink';
import { useJoinProjectFromLink } from './projects/joinFromLink';
import { MapPresence } from './live/MapPresence';
import { OverlayCornerHandles } from './overlay/OverlayCornerHandles';
import { EmbedBadge } from './components/EmbedBadge';
import { isEmbedRequested } from './lib/embedMode';
import { useEmbedMessaging } from './lib/embedMessaging';

const MOBILE_SHEET_HEIGHT = '45vh';

export function App() {
  const navOpened = useAppStore((s) => s.navOpened);
  const asideWidth = useAppStore((s) => s.asideWidth);
  const setAsideWidth = useAppStore((s) => s.setAsideWidth);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const uiHidden = useAppStore((s) => s.uiHidden);
  const toggleUiHidden = useAppStore((s) => s.toggleUiHidden);
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
    registerAppShellWorker();
  }, []);

  // mirrors layers, annotations and bookmarks while a live document is open
  useEffect(() => startDocumentBridge(), []);
  useJoinLiveFromLink();
  useJoinProjectFromLink();

  // a view-role share link renders view-only chrome: no chat, no draw
  const viewOnly = useViewOnlyLive();
  // an iframe embed renders no chrome at all, just the map and a badge
  const embed = isEmbedRequested();
  useEmbedMessaging(embed);

  useBackendDiscovery();
  useKeyboardShortcuts(
    embed
      ? {}
      : viewOnly
        ? {
            't': toggleSpaceTime,
            'ctrl+.': toggleUiHidden,
            ...MEASURE_SHORTCUTS,
          }
        : {
            'ctrl+b': toggleChat,
            'b': toggleChat,
            't': toggleSpaceTime,
            'ctrl+.': toggleUiHidden,
            ...TOOL_SHORTCUTS,
          },
  );

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
      {!embed && <CommandPalette />}
      <ModalsProvider>
        <AppShell
          header={{ height: 48, collapsed: uiHidden || embed }}
          aside={{
            width: isMobile ? '100vw' : asideWidth,
            breakpoint: 'sm',
            collapsed: {
              mobile: !mobileChatOpen || uiHidden || viewOnly || embed,
              desktop: !navOpened || uiHidden || viewOnly || embed,
            },
          }}
          padding={0}
        >
          <AppShell.Header
            style={{ background: 'var(--mantine-color-dark-8)', borderColor: 'var(--mantine-color-dark-5)' }}
          >
            <Header />
          </AppShell.Header>

          <AppShell.Aside
            style={{
              background: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-5)',
              // phone: a bottom sheet, so the map stays visible above the chat.
              // the explicit transform overrides Mantine's slide-out-right.
              ...(isMobile && {
                top: 'auto',
                bottom: 0,
                insetInlineStart: 0,
                height: MOBILE_SHEET_HEIGHT,
                borderTop: '1px solid var(--mantine-color-dark-5)',
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
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-violet-7)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              />
            )}
            <ChatPanel />
          </AppShell.Aside>

          {/* Floating chat toggle: phones only, desktop has the header icon */}
          {isMobile && !uiHidden && !viewOnly && !embed && (
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
                  // it rides just above the sheet so it never covers chat
                  bottom: mobileChatOpen ? `calc(${MOBILE_SHEET_HEIGHT} + 12px)` : 24,
                  right: 12,
                  zIndex: 400,
                }}
              >
                {chatOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
              </ActionIcon>
            </Tooltip>
          )}

          <AppShell.Main
            style={{
              background: 'var(--mantine-color-dark-8)',
              display: 'flex',
              flexDirection: 'column',
              height: uiHidden || embed ? '100vh' : 'calc(100vh - 48px)',
              position: 'relative',
            }}
          >
            {isMobile && !uiHidden && !embed && (
              <Group
                px="sm"
                py={4}
                style={{ borderBottom: '1px solid var(--mantine-color-dark-5)', background: 'var(--mantine-color-dark-7)', overflowX: 'auto' }}
                wrap="nowrap"
              >
                <ViewerToolbar compact />
              </Group>
            )}
            <ErrorBoundary fallbackMessage="Map viewer encountered an error">
              <ViewerArea />
            </ErrorBoundary>
            {!uiHidden && !embed && (
              <ErrorBoundary fallbackMessage="SpaceTime panel error">
                <SpaceTimePanel />
              </ErrorBoundary>
            )}
            {!uiHidden && !embed && <ToolPanels />}
            {!uiHidden && !embed && <OverlayCornerHandles />}
            <MapPresence />
            {!embed && <WindowDropZone />}
            {!uiHidden && !embed && <FirstRunOverlay />}
            {!uiHidden && !embed && <WelcomeCard />}
            {!uiHidden && !embed && <TourOverlay />}
            {embed && <EmbedBadge />}
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}

