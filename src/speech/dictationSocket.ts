import { BEARER_SUBPROTOCOL } from '../lib/apiAuth';
import { getAuthToken } from '../features/auth/store';
import { readSegments, type TranscriptSegment } from './segments';

/** nginx forwards this to the Aavaaz WhisperLive websocket. */
export const SPEECH_SOCKET_PATH = '/speech/';

const END_OF_AUDIO = new TextEncoder().encode('END_OF_AUDIO').buffer as ArrayBuffer;

export interface DictationSocketHandlers {
  onReady: () => void;
  onSegments: (segments: TranscriptSegment[]) => void;
  /** The server is full, `minutes` is its estimate until a slot frees. */
  onWait: (minutes: number) => void;
  /** The socket is gone, with no ready message first when `beforeReady`. */
  onClose: (beforeReady: boolean) => void;
}

export interface DictationSocket {
  sendAudio: (frame: Float32Array) => void;
  /** Tell the server the audio is over, it still sends the final segments after this. */
  endAudio: () => void;
  close: () => void;
}

/** ws or wss beside the page, the way the platform sockets are addressed. */
export function speechSocketUrl(): string {
  const url = new URL(SPEECH_SOCKET_PATH, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** The WhisperLive handshake, sent as the first message. */
export function handshake(uid: string): Record<string, unknown> {
  return { uid, language: 'en', task: 'transcribe', use_vad: true, audio_format: 'float32' };
}

export function openDictationSocket(
  handlers: DictationSocketHandlers,
  url = speechSocketUrl(),
): DictationSocket {
  const token = getAuthToken();
  const socket = token ? new WebSocket(url, [BEARER_SUBPROTOCOL, token]) : new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  let ready = false;
  let closed = false;

  socket.onopen = () => socket.send(JSON.stringify(handshake(crypto.randomUUID())));
  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return;
    const message = JSON.parse(event.data) as Record<string, unknown>;
    if (message.status === 'WAIT') {
      handlers.onWait(Number(message.message));
      return;
    }
    if (message.message === 'SERVER_READY') {
      ready = true;
      handlers.onReady();
      return;
    }
    if (message.message === 'DISCONNECT') {
      socket.close();
      return;
    }
    if ('segments' in message) handlers.onSegments(readSegments(message.segments));
  };
  socket.onclose = () => {
    if (closed) return;
    closed = true;
    handlers.onClose(!ready);
  };

  const sendOpen = (data: ArrayBuffer) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  };

  return {
    sendAudio: (frame) => sendOpen(frame.buffer as ArrayBuffer),
    endAudio: () => sendOpen(END_OF_AUDIO),
    close: () => {
      closed = true;
      socket.close();
    },
  };
}
