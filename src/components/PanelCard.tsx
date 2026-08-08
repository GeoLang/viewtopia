import { useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ActionIcon, Box, Group, Paper, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

const PANEL_TOP = 60;
const PANEL_SIDE = 16;
const PANEL_Z_INDEX = 300;

const ANCHOR_STYLE: Record<PanelAnchor, CSSProperties> = {
  right: { right: PANEL_SIDE },
  left: { left: PANEL_SIDE },
  center: { left: '50%', transform: 'translateX(-50%)' },
};

export type PanelAnchor = 'right' | 'left' | 'center';

// right-anchored cards render into the dock column the viewer area provides
// (see .panel-dock in global.css); without one (unit tests, viewer unmounted)
// they fall back to the floating absolute card
let panelDockElement: HTMLDivElement | null = null;
const panelDockListeners = new Set<() => void>();

export function setPanelDockElement(element: HTMLDivElement | null) {
  panelDockElement = element;
  for (const listener of panelDockListeners) listener();
}

function subscribeToPanelDock(listener: () => void) {
  panelDockListeners.add(listener);
  return () => {
    panelDockListeners.delete(listener);
  };
}

interface PanelCardProps {
  /** card width when floating (left/center anchor); docked cards fill the dock */
  width: number;
  anchor?: PanelAnchor;
  maxHeight?: string;
  testId?: string;
  children: ReactNode;
}

const CARD_STYLE: CSSProperties = {
  background: 'var(--mantine-color-dark-7)',
  border: '1px solid var(--mantine-color-dark-5)',
  display: 'flex',
  flexDirection: 'column',
};

/** the tool-panel chrome: dark card, docked right or floating left/center */
export function PanelCard({ width, anchor = 'right', maxHeight, testId, children }: PanelCardProps) {
  const dock = useSyncExternalStore(subscribeToPanelDock, () => panelDockElement);

  if (anchor === 'right' && dock) {
    return createPortal(
      <Paper shadow="xl" radius="md" p="sm" data-testid={testId} style={{ ...CARD_STYLE, maxHeight }}>
        {children}
      </Paper>,
      dock,
    );
  }

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      data-testid={testId}
      style={{
        ...CARD_STYLE,
        position: 'absolute',
        top: PANEL_TOP,
        width,
        maxHeight,
        zIndex: PANEL_Z_INDEX,
        ...ANCHOR_STYLE[anchor],
      }}
    >
      {children}
    </Paper>
  );
}

interface PanelHeaderProps {
  /** rendered in the accent color; icons inherit it via currentColor */
  icon: ReactNode;
  title: string;
  onClose: () => void;
  /** extra ActionIcons rendered left of the close button */
  actions?: ReactNode;
  /** rendered right of the title, e.g. a count Badge */
  badge?: ReactNode;
  closeLabel?: string;
}

export function PanelHeader({ icon, title, onClose, actions, badge, closeLabel }: PanelHeaderProps) {
  return (
    <Group justify="space-between" mb="xs">
      <Group gap="xs">
        <Box c="violet.4" display="flex">
          {icon}
        </Box>
        <Text size="sm" fw={600} c="white">
          {title}
        </Text>
        {badge}
      </Group>
      <Group gap={4}>
        {actions}
        <PanelCloseButton onClose={onClose} label={closeLabel} />
      </Group>
    </Group>
  );
}

export function PanelCloseButton({ onClose, label }: { onClose: () => void; label?: string }) {
  return (
    <ActionIcon
      size="sm"
      variant="subtle"
      color="gray"
      onClick={onClose}
      aria-label={label ?? 'Close panel'}
    >
      <IconX size={14} />
    </ActionIcon>
  );
}
