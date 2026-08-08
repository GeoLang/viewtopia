import { describe, expect, it } from 'vitest';
import { matchingMentionCandidates, mentionTriggerAt } from '../../src/live/MentionTextarea';

describe('mention trigger detection', () => {
  it('finds the @query being typed at the cursor', () => {
    expect(mentionTriggerAt('hello @gr', 9)).toEqual({ atIndex: 6, query: 'gr' });
    expect(mentionTriggerAt('@', 1)).toEqual({ atIndex: 0, query: '' });
    expect(mentionTriggerAt('say @ada more', 8)).toEqual({ atIndex: 4, query: 'ada' });
  });

  it('needs the cursor right after the query', () => {
    expect(mentionTriggerAt('say @ada more', 13)).toBeNull();
  });

  it('does not trigger mid word, so an email address is left alone', () => {
    expect(mentionTriggerAt('mail me a@b', 11)).toBeNull();
  });

  it('stops at whitespace after the @', () => {
    expect(mentionTriggerAt('@ada lovelace', 13)).toBeNull();
  });
});

describe('mention candidate matching', () => {
  const candidates = [
    { userId: 'ada@example.com', name: 'Ada Lovelace' },
    { userId: 'grace', name: 'Grace Hopper' },
  ];

  it('matches on name or user id, case insensitively', () => {
    expect(matchingMentionCandidates(candidates, 'LOVE')).toEqual([candidates[0]]);
    expect(matchingMentionCandidates(candidates, 'grace')).toEqual([candidates[1]]);
    expect(matchingMentionCandidates(candidates, '')).toEqual(candidates);
    expect(matchingMentionCandidates(candidates, 'nobody')).toEqual([]);
  });

  it('caps the suggestion list', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      userId: `user-${index}`,
      name: `User ${index}`,
    }));
    expect(matchingMentionCandidates(many, 'user')).toHaveLength(6);
  });
});
