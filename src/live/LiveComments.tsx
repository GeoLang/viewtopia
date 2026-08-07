import { useState } from 'react';
import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { commentThreads } from './comments';
import { LiveCommentsPanel } from './LiveCommentsPanel';
import { useLiveStore } from './liveStore';

export function LiveComments() {
  const comments = useLiveStore((s) => s.document.comments);
  const [open, setOpen] = useState(false);
  const openThreads = commentThreads(comments).filter((thread) => !thread.root.resolved).length;

  return (
    <>
      <Tooltip label="Comments on this live map">
        <Indicator
          size={14}
          offset={2}
          color="violet"
          label={openThreads}
          disabled={openThreads === 0}
        >
          <ActionIcon
            size="sm"
            variant="subtle"
            color="violet"
            aria-label="Comments on this live map"
            onClick={() => setOpen((shown) => !shown)}
          >
            <IconMessage size={14} />
          </ActionIcon>
        </Indicator>
      </Tooltip>
      {open && <LiveCommentsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
