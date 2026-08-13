import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  downloadRecording,
  fileExtensionFor,
  selectRecorderMimeType,
  startCanvasRecording,
} from '../../src/lib/canvasRecorder';

class FakeMediaRecorder {
  static supported: string[] = [];
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(mimeType: string) {
    return FakeMediaRecorder.supported.includes(mimeType);
  }

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: { getTracks(): { stop: () => void }[] },
    public options: { mimeType: string },
  ) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }

  emit(bytes: string) {
    this.ondataavailable?.({ data: new Blob([bytes]) });
  }
}

const tracks = [{ stop: vi.fn() }];

function fakeCanvas() {
  const canvas = document.createElement('canvas');
  const captureStream = vi.fn(() => ({ getTracks: () => tracks }));
  (canvas as unknown as { captureStream: unknown }).captureStream = captureStream;
  return { canvas, captureStream };
}

const supportOnly = (...mimeTypes: string[]) => {
  FakeMediaRecorder.supported = mimeTypes;
};

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances.length = 0;
  supportOnly();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectRecorderMimeType', () => {
  it('takes mp4 over webm when the browser writes both', () => {
    supportOnly('video/webm;codecs=vp9', 'video/mp4;codecs=avc1', 'video/mp4');

    expect(selectRecorderMimeType()).toBe('video/mp4;codecs=avc1');
  });

  it('prefers the codec-qualified mp4 string', () => {
    supportOnly('video/mp4', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1');

    expect(selectRecorderMimeType()).toBe('video/mp4;codecs=avc1.42E01E');
  });

  it('falls back to vp9 and then vp8', () => {
    supportOnly('video/webm;codecs=vp8', 'video/webm;codecs=vp9');
    expect(selectRecorderMimeType()).toBe('video/webm;codecs=vp9');

    supportOnly('video/webm;codecs=vp8');
    expect(selectRecorderMimeType()).toBe('video/webm;codecs=vp8');
  });

  it('has nothing to record with when no container is supported', () => {
    supportOnly();

    expect(selectRecorderMimeType()).toBeNull();
  });
});

describe('fileExtensionFor', () => {
  it('follows the container of the chosen codec string', () => {
    expect(fileExtensionFor('video/mp4;codecs=avc1.42E01E')).toBe('mp4');
    expect(fileExtensionFor('video/webm;codecs=vp9')).toBe('webm');
  });
});

describe('startCanvasRecording', () => {
  it('records the canvas at 30 fps in the best container', () => {
    supportOnly('video/mp4', 'video/webm;codecs=vp9');
    const { canvas, captureStream } = fakeCanvas();

    const recording = startCanvasRecording(canvas);

    expect(captureStream).toHaveBeenCalledWith(30);
    expect(recording?.mimeType).toBe('video/mp4');
    const recorder = FakeMediaRecorder.instances[0];
    expect(recorder.options.mimeType).toBe('video/mp4');
    expect(recorder.state).toBe('recording');
  });

  it('gives up rather than capturing frames it cannot encode', () => {
    supportOnly();
    const { canvas, captureStream } = fakeCanvas();

    expect(startCanvasRecording(canvas)).toBeNull();
    expect(captureStream).not.toHaveBeenCalled();
  });

  it('resolves stop with everything captured and releases the stream', async () => {
    supportOnly('video/webm;codecs=vp9');
    const { canvas } = fakeCanvas();

    const recording = startCanvasRecording(canvas);
    if (!recording) throw new Error('no recording started');
    const recorder = FakeMediaRecorder.instances[0];
    recorder.emit('one');
    recorder.emit('two');

    const video = await recording.stop();

    expect(video.type).toBe('video/webm;codecs=vp9');
    expect(await video.text()).toBe('onetwo');
    expect(recorder.state).toBe('inactive');
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('still resolves when the recorder already stopped itself', async () => {
    supportOnly('video/mp4');
    const { canvas } = fakeCanvas();

    const recording = startCanvasRecording(canvas);
    if (!recording) throw new Error('no recording started');
    FakeMediaRecorder.instances[0].state = 'inactive';

    await expect(recording.stop()).resolves.toBeInstanceOf(Blob);
  });
});

describe('downloadRecording', () => {
  it('names the file after the chosen container', () => {
    const anchor = document.createElement('a');
    anchor.click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:video', revokeObjectURL: vi.fn() });

    downloadRecording(new Blob(['x']), 'flythrough-7', 'video/mp4;codecs=avc1');

    expect(anchor.download).toBe('flythrough-7.mp4');
    expect(anchor.href).toContain('blob:video');
    expect(anchor.click).toHaveBeenCalled();
  });
});
