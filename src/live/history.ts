import { readDocumentKey, type LiveDocument, type LiveOperation } from './types';

/** One key a frame wrote: the value it wrote, and what stood there before. */
export interface HistoryWrite {
  key: string;
  wrote: unknown;
  before: unknown;
}

/** One applied frame of our own, which is one undo step. */
export type HistoryStep = HistoryWrite[];

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return Object.fromEntries(entries.map(([key, member]) => [key, canonical(member)]));
}

/**
 * Agora stores an op value as sorted json, so our own write comes back with its
 * keys in another order and a plain stringify would read it as someone else's.
 */
export function sameDocumentValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left ?? null)) === JSON.stringify(canonical(right ?? null));
}

/**
 * What a frame is about to write, against what it writes over. A key written
 * twice in one frame keeps the value from before the frame and the value the
 * frame settled on.
 */
export function stepFor(document: LiveDocument, operations: LiveOperation[]): HistoryStep {
  const writes = new Map<string, HistoryWrite>();
  for (const operation of operations) {
    const earlier = writes.get(operation.key);
    writes.set(operation.key, {
      key: operation.key,
      wrote: operation.value,
      before: earlier ? earlier.before : readDocumentKey(document, operation.key),
    });
  }
  return [...writes.values()];
}

export function operationsFor(step: HistoryStep): LiveOperation[] {
  return step.map((write) => ({ key: write.key, value: write.wrote }));
}

/**
 * The step that takes `step` back, leaving out any key written since so an undo
 * never clobbers a newer edit. Null when every key has been written since.
 */
export function reversalOf(document: LiveDocument, step: HistoryStep): HistoryStep | null {
  const reversal = step
    .filter((write) => sameDocumentValue(readDocumentKey(document, write.key), write.wrote))
    .map((write) => ({ key: write.key, wrote: write.before, before: write.wrote }));
  return reversal.length > 0 ? reversal : null;
}

/**
 * The newest step that still has something to take back, and the stack without
 * it and without the steps above it that were written over whole.
 */
export function nextReversal(
  steps: HistoryStep[],
  document: LiveDocument,
): { remaining: HistoryStep[]; reversal: HistoryStep } | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const reversal = reversalOf(document, steps[index]);
    if (reversal) return { remaining: steps.slice(0, index), reversal };
  }
  return null;
}
