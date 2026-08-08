import { Group, ActionIcon, Title, Tooltip } from '@mantine/core';
import {
  IconGlobe,
  IconMaximize,
  IconMessage,
  IconMinimize,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';
import { useMantineColorScheme } from '@mantine/core';
import { useFullscreen, useMediaQuery } from '@mantine/hooks';
import { useAppStore } from '../store/app';
import { useViewOnlyLive } from '../live/liveStore';
import { MOBILE_QUERY } from '../theme';
import { OfflineIndicator } from '../offline/OfflineIndicator';
import { ProjectSwitcher } from '../projects/ProjectSwitcher';
import { AuthControl } from '../features/auth/AuthControl';
import { LiveSessionControl } from '../live/LiveSessionControl';
import { NotificationsBell } from '../live/NotificationsBell';
import { BackendStatus } from './BackendStatus';
import { ViewerToolbar } from './ViewerToolbar';

export function Header() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { toggle: toggleFullscreen, fullscreen } = useFullscreen();
  const navOpened = useAppStore((s) => s.navOpened);
  const toggleNav = useAppStore((s) => s.toggleNav);
  const viewOnly = useViewOnlyLive();
  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });

  return (
    <Group
      h="100%"
      px={isMobile ? 'xs' : 'md'}
      gap="sm"
      wrap="nowrap"
    >
      <Group gap="xs" wrap="nowrap">
        <IconGlobe size={20} style={{ color: 'var(--mantine-color-violet-4)' }} />
        <Title order={4} c="white" fw={600} visibleFrom="md">
          ViewTopia
        </Title>
        <ProjectSwitcher />
        <LiveSessionControl />
        <NotificationsBell />
      </Group>

      {!isMobile && <ViewerToolbar />}

      <Group gap="xs" wrap="nowrap" ml="auto">
        {!isMobile && <OfflineIndicator />}
        {!isMobile && <BackendStatus />}

        {!isMobile && !viewOnly && (
          <Tooltip label={navOpened ? 'Hide chat (Ctrl+B)' : 'Show chat (Ctrl+B)'}>
            <ActionIcon
              aria-label={navOpened ? 'Hide chat' : 'Show chat'}
              variant={navOpened ? 'filled' : 'subtle'}
              color="violet"
              onClick={toggleNav}
            >
              <IconMessage size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        <Tooltip label={fullscreen ? 'Exit full screen' : 'Full screen'}>
          <ActionIcon
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            variant="subtle"
            color="gray"
            onClick={toggleFullscreen}
          >
            {fullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Toggle theme">
          <ActionIcon
            aria-label="Toggle theme"
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

        <AuthControl />
      </Group>
    </Group>
  );
}
