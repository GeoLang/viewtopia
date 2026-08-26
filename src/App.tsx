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
import { IconLayoutNavbarExpand, IconMenu2, IconX } from '@tabler/icons-react';
import { announceChatMode } from './actions/chatMode';
import { useAppStore } from './store/app';
import { theme, MOBILE_QUERY } from './theme';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { ViewerToolbar } from './components/ViewerToolbar';
import { CommandPalette } from './components/CommandPalette';
import { WindowDropZone } from './components/WindowDropZone';
import { TilesetOffer } from './features/tilesets/TilesetOffer';
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
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);
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

  // what the mode is, and what it cannot do, said once for each entry
  useEffect(() => {
    announceChatMode(chatMode);
  }, [chatMode]);

  // the header, the panel dock and the toolbars are all gone in chat mode, so
  // the map has the window to itself the way presentation mode leaves it
  const chromeHidden = uiHidden || embed || chatMode;
  const mobileSheetOpen = mobileChatOpen || chatMode;

  const keyboardShortcuts = (): Record<string, () => void> => {
    if (embed) return {};
    // the rest either open a panel or need the cursor, so chat mode keeps only
    // the one that hides the chrome
    if (chatMode) return { 'ctrl+.': toggleUiHidden };
    if (viewOnly) {
      return { 't': toggleSpaceTime, 'ctrl+.': toggleUiHidden, ...MEASURE_SHORTCUTS };
    }
    return {
      'ctrl+b': toggleChat,
      'b': toggleChat,
      't': toggleSpaceTime,
      'ctrl+.': toggleUiHidden,
      ...TOOL_SHORTCUTS,
    };
  };

  useBackendDiscovery();
  useKeyboardShortcuts(keyboardShortcuts());

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
          header={{ height: 48, collapsed: chromeHidden }}
          aside={{
            width: isMobile ? '100vw' : asideWidth,
            breakpoint: 'sm',
            // chat mode leaves the chat as the only control, so it is always open
            collapsed: {
              mobile: !chatMode && (!mobileChatOpen || uiHidden || viewOnly || embed),
              desktop: !chatMode && (!navOpened || uiHidden || viewOnly || embed),
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
                transform: mobileSheetOpen ? 'translateY(0)' : 'translateY(100%)',
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
          {isMobile && !chromeHidden && !viewOnly && (
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
                  bottom: mobileSheetOpen ? `calc(${MOBILE_SHEET_HEIGHT} + 12px)` : 24,
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
              height: chromeHidden ? '100vh' : 'calc(100vh - 48px)',
              position: 'relative',
            }}
          >
            {isMobile && !chromeHidden && (
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
            {!chromeHidden && (
              <ErrorBoundary fallbackMessage="SpaceTime panel error">
                <SpaceTimePanel />
              </ErrorBoundary>
            )}
            {!chromeHidden && <ToolPanels />}
            {!chromeHidden && <OverlayCornerHandles />}
            {/* chat mode hides the header, so the way back rides on the map */}
            {chatMode && (
              <Tooltip label="Exit chat-only mode" position="right">
                <ActionIcon
                  aria-label="Exit chat mode"
                  variant="filled"
                  color="violet"
                  size="lg"
                  radius="xl"
                  onClick={() => setChatMode(false)}
                  style={{ position: 'absolute', top: 12, left: 12, zIndex: 400 }}
                >
                  <IconLayoutNavbarExpand size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            <MapPresence />
            {!embed && <WindowDropZone />}
            {!embed && <TilesetOffer />}
            {!chromeHidden && <FirstRunOverlay />}
            {!chromeHidden && <TourOverlay />}
            {embed && <EmbedBadge />}
          </AppShell.Main>
        </AppShell>
      </ModalsProvider>
    </MantineProvider>
  );
}

