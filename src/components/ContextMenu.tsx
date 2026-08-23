import { useEffect, useCallback } from 'react';
import { Paper, Text, Stack, Divider } from '@mantine/core';
import {
  IconMapPin,
  IconMessage,
  IconRuler,
  IconCopy,
  IconCamera,
  IconRoute,
  IconInfoCircle,
  IconClock,
} from '@tabler/icons-react';
import { canEditLiveDocument } from '../live/liveStore';
import { useMapCommentsStore } from '../live/mapCommentsStore';
import { useAppStore } from '../store/app';

interface MenuAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

export function ContextMenu() {
  const { contextMenu, hideContextMenu, togglePanel, addBookmark } = useAppStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu();
    },
    [hideContextMenu],
  );

  useEffect(() => {
    if (contextMenu) {
      window.addEventListener('keydown', handleKeyDown);
      const handler = () => hideContextMenu();
      window.addEventListener('click', handler);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('click', handler);
      };
    }
  }, [contextMenu, handleKeyDown, hideContextMenu]);

  if (!contextMenu) return null;

  const { x, y, lat, lng } = contextMenu;

  const actions: MenuAction[] = [
    {
      icon: <IconCopy size={14} />,
      label: `Copy: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      onClick: () => {
        navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        hideContextMenu();
      },
    },
    {
      icon: <IconMapPin size={14} />,
      label: 'Drop pin here',
      onClick: () => {
        togglePanel('annotate');
        hideContextMenu();
      },
    },
    ...(canEditLiveDocument()
      ? [
          {
            icon: <IconMessage size={14} />,
            label: 'Comment here',
            onClick: () => {
              useMapCommentsStore.getState().openDraft(lng, lat);
              hideContextMenu();
            },
          },
        ]
      : []),
    {
      icon: <IconRuler size={14} />,
      label: 'Measure from here',
      onClick: () => {
        togglePanel('measure');
        hideContextMenu();
      },
    },
    {
      icon: <IconRoute size={14} />,
      label: 'Route from here',
      onClick: () => {
        togglePanel('routing');
        hideContextMenu();
      },
    },
    {
      icon: <IconRoute size={14} />,
      label: 'Route to here',
      onClick: () => {
        togglePanel('routing');
        hideContextMenu();
      },
    },
    {
      icon: <IconClock size={14} />,
      label: 'Isochrone from here',
      onClick: () => {
        togglePanel('routing');
        hideContextMenu();
      },
    },
    {
      icon: <IconCamera size={14} />,
      label: 'Bookmark this view',
      onClick: () => {
        addBookmark({
          id: crypto.randomUUID(),
          name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          lat,
          lng,
          zoom: 12,
          createdAt: Date.now(),
        });
        hideContextMenu();
      },
    },
    {
      icon: <IconInfoCircle size={14} />,
      label: 'What\'s here?',
      onClick: () => {
        togglePanel('geocoding');
        hideContextMenu();
      },
    },
  ];

  return (
    <Paper
      shadow="xl"
      radius="sm"
      p={4}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width: 220,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: 1000,
      }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <Text size="xs" c="dimmed" px="xs" py={2}>
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </Text>
      <Divider color="dark.5" my={2} />
      <Stack gap={0}>
        {actions.map((action, i) => (
          <Text
            key={i}
            size="xs"
            c="gray.3"
            px="xs"
            py={4}
            style={{
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e: React.MouseEvent) =>
              ((e.target as HTMLElement).style.background = 'var(--mantine-color-dark-6)')
            }
            onMouseLeave={(e: React.MouseEvent) =>
              ((e.target as HTMLElement).style.background = 'transparent')
            }
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}
