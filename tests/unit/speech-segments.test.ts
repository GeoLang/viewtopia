import { describe, it, expect } from 'vitest';
import {
  afterWatermark,
  mergeSegments,
  readSegments,
  transcriptEnd,
  transcriptText,
  withTypedPrefix,
} from '../../src/speech/segments';

const seg = (start: number, text: string, completed = false) => ({
  start,
  end: start + 1,
  text,
  completed,
});

describe('reading WhisperLive segments', () => {
  it('turns string times into numbers and a missing completed into false', () => {
    expect(readSegments([{ start: '0.000', end: '1.500', text: ' fly ' }])).toEqual([
      { start: 0, end: 1.5, text: ' fly ', completed: false },
    ]);
  });

  it('reads nothing from a message without a list', () => {
    expect(readSegments(undefined)).toEqual([]);
  });
});

describe('merging server windows', () => {
  it('replaces the in-progress tail with the revised window', () => {
    const kept = [seg(0, 'fly to', true), seg(1, 'par')];
    const merged = mergeSegments(kept, [seg(1, 'Paris', true), seg(2, 'and zoom')]);
    expect(transcriptText(merged)).toBe('fly to Paris and zoom');
  });

  it('keeps completed segments the window no longer carries', () => {
    const kept = Array.from({ length: 12 }, (_, i) => seg(i, `w${i}`, true));
    const merged = mergeSegments(kept, [seg(11, 'w11 revised', true), seg(12, 'w12')]);
    expect(merged).toHaveLength(13);
    expect(transcriptText(merged)).toMatch(/^w0 w1 .* w10 w11 revised w12$/);
  });

  it('drops an unfinished segment the window re-cut', () => {
    const merged = mergeSegments([seg(0.5, 'fl')], [seg(0, 'fly to Paris')]);
    expect(transcriptText(merged)).toBe('fly to Paris');
  });

  it('leaves the kept segments alone on an empty window', () => {
    const kept = [seg(0, 'fly', true)];
    expect(mergeSegments(kept, [])).toBe(kept);
  });
});

describe('the input text', () => {
  it('puts the transcript after what was typed', () => {
    expect(withTypedPrefix('show ', 'the parcels')).toBe('show the parcels');
    expect(withTypedPrefix('', 'the parcels')).toBe('the parcels');
    expect(withTypedPrefix('show', '')).toBe('show');
  });
});

describe('the watermark that survives a send', () => {
  it('drops what was already sent and keeps what came after', () => {
    const spoken = [seg(0, 'fly to paris', true), seg(2, 'now show parks')];
    expect(transcriptText(afterWatermark(spoken, 1))).toBe('now show parks');
  });

  it('keeps everything when nothing has been sent yet', () => {
    const spoken = [seg(0, 'fly to paris', true)];
    expect(afterWatermark(spoken, 0)).toEqual(spoken);
  });

  it('takes the watermark from the end of the last segment', () => {
    expect(transcriptEnd([seg(0, 'one'), seg(4, 'two')])).toBe(5);
    expect(transcriptEnd([])).toBe(0);
  });

  it('hides a segment the server resends after it was sent', () => {
    const spoken = [seg(0, 'fly to paris', true)];
    const watermark = transcriptEnd(spoken);
    // the server keeps resending its last ten, so the same segment comes back
    const resent = mergeSegments(spoken, [seg(0, 'fly to paris', true)]);
    expect(transcriptText(afterWatermark(resent, watermark))).toBe('');
  });
});
