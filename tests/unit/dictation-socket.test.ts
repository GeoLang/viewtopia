import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDictationSocket, handshake, speechSocketUrl } from '../../src/speech/dictationSocket';

/** A WebSocket the test drives by hand: records sends, fires events on demand. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  binaryType = 'blob';
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  serverSays(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const handlers = () => ({
  onReady: vi.fn(),
  onSegments: vi.fn(),
  onWait: vi.fn(),
  onClose: vi.fn(),
});

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('crypto', { randomUUID: () => 'uid-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the dictation socket', () => {
  it('addresses the speech route beside the page as a websocket', () => {
    expect(speechSocketUrl()).toBe('ws://localhost:3000/speech/');
  });

  it('sends the WhisperLive handshake first', () => {
    const h = handlers();
    openDictationSocket(h, 'ws://x/speech/');
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();

    expect(JSON.parse(ws.sent[0] as string)).toEqual(handshake('uid-1'));
    expect(handshake('uid-1')).toMatchObject({ language: 'en', task: 'transcribe', use_vad: true });
  });

  it('reports ready, then every segment window, then the end of the audio', () => {
    const h = handlers();
    const socket = openDictationSocket(h, 'ws://x/speech/');
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();

    ws.serverSays({ uid: 'uid-1', message: 'SERVER_READY', backend: 'faster_whisper' });
    expect(h.onReady).toHaveBeenCalledOnce();

    ws.serverSays({ uid: 'uid-1', segments: [{ start: '0.0', end: '1.0', text: 'fly to' }] });
    expect(h.onSegments).toHaveBeenCalledWith([
      { start: 0, end: 1, text: 'fly to', completed: false },
    ]);

    socket.sendAudio(new Float32Array([0.1, 0.2]));
    socket.endAudio();
    expect(ws.sent[1]).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(ws.sent[2] as Uint8Array)).toBe('END_OF_AUDIO');
  });

  it('says the server is full and how long to wait', () => {
    const h = handlers();
    openDictationSocket(h, 'ws://x/speech/');
    FakeWebSocket.instances[0].serverSays({ uid: 'uid-1', status: 'WAIT', message: 2.4 });
    expect(h.onWait).toHaveBeenCalledWith(2.4);
  });

  it('tells a close before ready apart from one after', () => {
    const h = handlers();
    openDictationSocket(h, 'ws://x/speech/');
    FakeWebSocket.instances[0].close();
    expect(h.onClose).toHaveBeenCalledWith(true);

    const later = handlers();
    openDictationSocket(later, 'ws://x/speech/');
    const ws = FakeWebSocket.instances[1];
    ws.serverSays({ uid: 'uid-1', message: 'SERVER_READY' });
    ws.serverSays({ uid: 'uid-1', message: 'DISCONNECT' });
    expect(later.onClose).toHaveBeenCalledWith(false);
  });

  it('stays quiet after the caller closed it', () => {
    const h = handlers();
    const socket = openDictationSocket(h, 'ws://x/speech/');
    socket.close();
    expect(h.onClose).not.toHaveBeenCalled();
  });
});
