import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import type { DictationState } from './useDictation';

const LABELS: Record<DictationState, string> = {
  idle: 'Dictate',
  connecting: 'Connecting to the speech service',
  listening: 'Stop dictating',
};

export function DictationButton({
  state,
  disabled,
  onToggle,
}: {
  state: DictationState;
  disabled: boolean;
  onToggle: () => void;
}) {
  const listening = state === 'listening';
  return (
    <Tooltip label={LABELS[state]}>
      <ActionIcon
        aria-label={LABELS[state]}
        aria-pressed={listening}
        variant={listening ? 'filled' : 'default'}
        color={listening ? 'red' : 'gray'}
        size="lg"
        loading={state === 'connecting'}
        disabled={disabled}
        onClick={onToggle}
      >
        <IconMicrophone size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
