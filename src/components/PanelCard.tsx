import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ActionIcon, Box, Group, Paper, Text } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import { useAppStore } from '../store/app';

const PANEL_TOP = 60;
const PANEL_SIDE = 16;
const PANEL_Z_INDEX = 300;
/** pointer travel that separates a click on the title bar from a drag of it */
const DRAG_THRESHOLD = 4;

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

/** true for a header rendered inside a PanelCard, the only place minimize and drag work */
const InPanelCard = createContext(false);

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
  const minimized = useAppStore((s) => s.panelMinimized);
  const position = useAppStore((s) => s.panelPosition);
  const docked = anchor === 'right' && dock !== null;
  const placement = placementStyle({ position, docked, anchor, width });

  const card = (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      className={minimized ? 'panel-card-enter panel-card-minimized' : 'panel-card-enter'}
      data-panel-card=""
      data-testid={testId}
      style={{ ...CARD_STYLE, maxHeight: minimized ? undefined : maxHeight, ...placement }}
    >
      <InPanelCard.Provider value={true}>{children}</InPanelCard.Provider>
    </Paper>
  );

  if (docked && dock) return createPortal(card, dock);
  return card;
}

interface Placement {
  position: { x: number; y: number } | null;
  docked: boolean;
  anchor: PanelAnchor;
  width: number;
}

// a dragged card keeps its parent and only swaps to fixed placement, so the drag
// goes on measuring one element instead of a fresh one mounted somewhere else
function placementStyle({ position, docked, anchor, width }: Placement): CSSProperties {
  if (position) {
    return { position: 'fixed', left: position.x, top: position.y, width, zIndex: PANEL_Z_INDEX };
  }
  if (docked) return {};
  return {
    position: 'absolute',
    top: PANEL_TOP,
    width,
    zIndex: PANEL_Z_INDEX,
    ...ANCHOR_STYLE[anchor],
  };
}

function clampToViewport(x: number, y: number, width: number, height: number) {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - width)),
    y: Math.max(0, Math.min(y, window.innerHeight - height)),
  };
}

function isControl(target: EventTarget | null) {
  return target instanceof Element && target.closest('button, input, a') !== null;
}

/** drags the whole card by its title bar, once the pointer has moved far enough to mean it */
function usePanelDrag() {
  const setPanelPosition = useAppStore((s) => s.setPanelPosition);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  return (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isControl(event.target)) return;
    const card = event.currentTarget.closest('[data-panel-card]');
    if (!(card instanceof HTMLElement)) return;

    const rect = card.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    let dragging = false;

    const onMove = (e: PointerEvent) => {
      const travel = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
      if (!dragging && travel < DRAG_THRESHOLD) return;
      dragging = true;
      const current = card.getBoundingClientRect();
      setPanelPosition(
        clampToViewport(e.clientX - offsetX, e.clientY - offsetY, current.width, current.height),
      );
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopRef.current = null;
    };
    stopRef.current?.();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    stopRef.current = stop;
  };
}

const HANDLE_STYLE: CSSProperties = { cursor: 'grab', touchAction: 'none', userSelect: 'none' };

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
  const inCard = useContext(InPanelCard);
  const minimized = useAppStore((s) => s.panelMinimized);
  const toggleMinimized = useAppStore((s) => s.togglePanelMinimized);
  const startDrag = usePanelDrag();

  return (
    <Group
      justify="space-between"
      mb="xs"
      data-panel-handle={inCard ? '' : undefined}
      style={inCard ? HANDLE_STYLE : undefined}
      onPointerDown={inCard ? startDrag : undefined}
      onDoubleClick={
        inCard
          ? (e) => {
              if (!isControl(e.target)) toggleMinimized();
            }
          : undefined
      }
    >
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
        {inCard && (
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={toggleMinimized}
            aria-label={minimized ? 'Restore panel' : 'Minimize panel'}
          >
            {minimized ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
          </ActionIcon>
        )}
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
