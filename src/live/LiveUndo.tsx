import { useEffect } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconArrowForwardUp } from '@tabler/icons-react';
import { useCanRedoLive, useCanUndoLive, useLiveStore } from './liveStore';

/** A focused text field has its own undo, which the shortcut must not take. */
function editingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Take back the last frame of your own in the live document, or put it back. */
export function LiveUndo() {
  const role = useLiveStore((s) => s.role);
  const canUndo = useCanUndoLive();
  const canRedo = useCanRedoLive();
  const undo = useLiveStore((s) => s.undo);
  const redo = useLiveStore((s) => s.redo);

  useEffect(() => {
    if (role !== 'edit') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      if (editingText(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [role, undo, redo]);

  if (role !== 'edit') return null;

  return (
    <>
      <Tooltip label="Undo your last change">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Undo your last change"
          disabled={!canUndo}
          onClick={undo}
          data-testid="live-undo"
        >
          <IconArrowBackUp size={14} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Redo your last change">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Redo your last change"
          disabled={!canRedo}
          onClick={redo}
          data-testid="live-redo"
        >
          <IconArrowForwardUp size={14} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
