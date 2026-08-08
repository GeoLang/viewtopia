import { useRef, useState } from 'react';
import { Box, Paper, Text, Textarea, UnstyledButton } from '@mantine/core';
import { COMMENT_TEXT_LIMIT } from './comments';
import type { LiveCommentMention } from './types';

const MENTION_QUERY_PATTERN = /(^|\s)@([^\s@]*)$/;
const MENTION_SUGGESTION_LIMIT = 6;

interface MentionTrigger {
  atIndex: number;
  query: string;
}

/** The `@query` being typed at the cursor, or null when the cursor is not on one. */
export function mentionTriggerAt(text: string, cursor: number): MentionTrigger | null {
  const match = MENTION_QUERY_PATTERN.exec(text.slice(0, cursor));
  if (!match) return null;
  return { atIndex: cursor - match[2].length - 1, query: match[2] };
}

export function matchingMentionCandidates(
  candidates: LiveCommentMention[],
  query: string,
): LiveCommentMention[] {
  const needle = query.toLowerCase();
  return candidates
    .filter(
      (candidate) =>
        candidate.name.toLowerCase().includes(needle) ||
        candidate.userId.toLowerCase().includes(needle),
    )
    .slice(0, MENTION_SUGGESTION_LIMIT);
}

/**
 * A comment compose box that offers document members while an `@name` is being
 * typed. Picking one inserts the name into the text and reports the pick, so
 * the caller can attach it to the comment it posts.
 */
export function MentionTextarea({
  value,
  onChange,
  onPick,
  candidates,
  placeholder,
  ariaLabel,
  minRows,
  maxRows,
  testId,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (mention: LiveCommentMention) => void;
  candidates: LiveCommentMention[];
  placeholder: string;
  ariaLabel: string;
  minRows: number;
  maxRows: number;
  testId?: string;
}) {
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [selected, setSelected] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const matches = trigger ? matchingMentionCandidates(candidates, trigger.query) : [];
  const open = matches.length > 0;

  const pick = (mention: LiveCommentMention) => {
    if (!trigger) return;
    const queryEnd = trigger.atIndex + 1 + trigger.query.length;
    onChange(`${value.slice(0, trigger.atIndex)}@${mention.name} ${value.slice(queryEnd)}`);
    onPick(mention);
    setTrigger(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(matches[selected]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setTrigger(null);
    }
  };

  return (
    <Box pos="relative" flex={1}>
      <Textarea
        ref={textareaRef}
        size="xs"
        autosize
        minRows={minRows}
        maxRows={maxRows}
        maxLength={COMMENT_TEXT_LIMIT}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid={testId}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
          setTrigger(
            mentionTriggerAt(event.currentTarget.value, event.currentTarget.selectionStart),
          );
          setSelected(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTrigger(null)}
      />
      {open && (
        <Paper
          withBorder
          shadow="md"
          p={4}
          pos="absolute"
          top="100%"
          left={0}
          right={0}
          mt={2}
          style={{ zIndex: 10 }}
          data-testid="mention-suggestions"
        >
          {matches.map((mention, index) => (
            <UnstyledButton
              key={mention.userId}
              w="100%"
              px={6}
              py={3}
              bg={index === selected ? 'var(--mantine-color-dark-5)' : undefined}
              style={{ borderRadius: 4 }}
              data-testid={`mention-option-${mention.userId}`}
              // mousedown so the pick lands before the textarea blur closes the list
              onMouseDown={(event) => {
                event.preventDefault();
                pick(mention);
              }}
              onMouseEnter={() => setSelected(index)}
            >
              <Text size="xs" c="white">
                {mention.name}
              </Text>
              {mention.name !== mention.userId && (
                <Text size="xs" c="dimmed">
                  {mention.userId}
                </Text>
              )}
            </UnstyledButton>
          ))}
        </Paper>
      )}
    </Box>
  );
}
