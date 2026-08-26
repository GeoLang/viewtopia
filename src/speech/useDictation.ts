import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { openDictationSocket, type DictationSocket } from './dictationSocket';
import { openMicrophone, type Microphone } from './microphone';
import { mergeSegments, transcriptText, type TranscriptSegment } from './segments';

export type DictationState = 'idle' | 'connecting' | 'listening';

/** After END_OF_AUDIO the server still sends the last segments, then the socket can go. */
const FINAL_SEGMENTS_GRACE_MS = 1500;

const unavailable = (message: string) =>
  notifications.show({ title: 'Dictation', message, color: 'red' });

/**
 * One dictation at a time: the socket opens, the server says it is ready, the
 * microphone streams into it, and every transcript window arrives as the whole
 * text so far through `onText`.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const socketRef = useRef<DictationSocket | null>(null);
  const microphoneRef = useRef<Microphone | null>(null);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const teardown = useCallback(() => {
    microphoneRef.current?.close();
    microphoneRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setState('idle');
  }, []);

  const start = useCallback(() => {
    if (socketRef.current) return;
    segmentsRef.current = [];
    setState('connecting');
    const socket = openDictationSocket({
      onReady: async () => {
        try {
          microphoneRef.current = await openMicrophone((frame) => socket.sendAudio(frame));
        } catch {
          unavailable('The microphone is blocked or missing.');
          teardown();
          return;
        }
        setState('listening');
      },
      onSegments: (window) => {
        segmentsRef.current = mergeSegments(segmentsRef.current, window);
        onTextRef.current(transcriptText(segmentsRef.current));
      },
      onWait: (minutes) => {
        unavailable(`The speech server is full, try again in about ${Math.ceil(minutes)} min.`);
        teardown();
      },
      onClose: (beforeReady) => {
        if (beforeReady) unavailable('The speech service is not answering.');
        if (socketRef.current === socket) teardown();
      },
    });
    socketRef.current = socket;
  }, [teardown]);

  const stop = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    microphoneRef.current?.close();
    microphoneRef.current = null;
    socketRef.current = null;
    setState('idle');
    socket.endAudio();
    setTimeout(() => socket.close(), FINAL_SEGMENTS_GRACE_MS);
  }, []);

  useEffect(() => teardown, [teardown]);

  return { state, start, stop };
}
