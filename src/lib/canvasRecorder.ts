/**
 * Records a canvas to a video file with MediaRecorder. MP4 is preferred because
 * every editor and player takes it; the WebM codecs are the fallback for
 * browsers whose MediaRecorder cannot write MP4.
 */

const CAPTURE_FRAMES_PER_SECOND = 30;

export const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export interface CanvasRecording {
  mimeType: string;
  /** Ends the recording and resolves with everything captured so far. */
  stop(): Promise<Blob>;
}

export function selectRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean = (mimeType) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType),
): string | null {
  return RECORDER_MIME_CANDIDATES.find(isTypeSupported) ?? null;
}

export function fileExtensionFor(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Starts recording the canvas, or returns null when no container is supported. */
export function startCanvasRecording(canvas: HTMLCanvasElement): CanvasRecording | null {
  const mimeType = selectRecorderMimeType();
  if (!mimeType) return null;

  const stream = canvas.captureStream(CAPTURE_FRAMES_PER_SECOND);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  return {
    mimeType,
    stop: () =>
      new Promise<Blob>((resolve) => {
        const finish = () => {
          for (const track of stream.getTracks()) track.stop();
          resolve(new Blob(chunks, { type: mimeType }));
        };
        if (recorder.state === 'inactive') {
          finish();
          return;
        }
        recorder.onstop = finish;
        recorder.stop();
      }),
  };
}

export function downloadRecording(blob: Blob, baseName: string, mimeType: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${baseName}.${fileExtensionFor(mimeType)}`;
  anchor.click();
  URL.revokeObjectURL(href);
}
