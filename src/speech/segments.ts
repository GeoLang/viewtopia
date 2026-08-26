/** One transcript segment the way WhisperLive sends it, times in seconds. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  completed: boolean;
}

/** WhisperLive sends times as strings and leaves `completed` out until it is true. */
export function readSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((seg) => ({
    start: Number(seg.start),
    end: Number(seg.end),
    text: String(seg.text ?? ''),
    completed: seg.completed === true,
  }));
}

/**
 * Fold a server window into the segments kept so far. The server resends its
 * last ten segments with revisions each time, so everything from the window's
 * first start onwards is the window, and only completed segments before it
 * survive from the earlier windows.
 */
export function mergeSegments(
  kept: TranscriptSegment[],
  window: TranscriptSegment[],
): TranscriptSegment[] {
  if (window.length === 0) return kept;
  const windowStart = window[0].start;
  const earlier = kept.filter((seg) => seg.completed && seg.start < windowStart);
  return [...earlier, ...window];
}

/** The segments as one line of text. */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => seg.text.trim())
    .filter((text) => text.length > 0)
    .join(' ');
}

/** The transcript after whatever was typed before dictation began. */
export function withTypedPrefix(prefix: string, transcript: string): string {
  const typed = prefix.trimEnd();
  if (!typed) return transcript;
  return transcript ? `${typed} ${transcript}` : typed;
}
