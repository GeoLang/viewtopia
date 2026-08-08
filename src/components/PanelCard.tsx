import type { CSSProperties, ReactNode } from 'react';
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

interface PanelCardProps {
  width: number;
  anchor?: PanelAnchor;
  maxHeight?: string;
  children: ReactNode;
}

/** the floating tool-panel chrome: dark card, absolute under the toolbar */
export function PanelCard({ width, anchor = 'right', maxHeight, children }: PanelCardProps) {
  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: PANEL_TOP,
        width,
        maxHeight,
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        zIndex: PANEL_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
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
}

export function PanelHeader({ icon, title, onClose, actions, badge }: PanelHeaderProps) {
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
        <PanelCloseButton onClose={onClose} />
      </Group>
    </Group>
  );
}

export function PanelCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose} aria-label="Close panel">
      <IconX size={14} />
    </ActionIcon>
  );
}
