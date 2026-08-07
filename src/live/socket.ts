import type { ClientMessage, ServerMessage } from './types';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;

export type LiveConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface LiveSocketOptions {
  documentId: string;
  token: string;
  /** highest applied sequence, so a reconnect resumes instead of resyncing */
  lastSeq: () => number;
  onMessage: (message: ServerMessage) => void;
  onStateChange: (state: LiveConnectionState) => void;
}

export function agoraSocketUrl(documentId: string, token: string, since: number): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ doc: documentId, since: String(since), token });
  return `${protocol}//${location.host}/agora/ws?${query.toString()}`;
}

export class LiveSocket {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByCaller = false;

  constructor(private readonly options: LiveSocketOptions) {}

  connect(): void {
    this.closedByCaller = false;
    this.options.onStateChange(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(
      agoraSocketUrl(this.options.documentId, this.options.token, this.options.lastSeq()),
    );
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.options.onStateChange('open');
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket) return;
      this.options.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.closedByCaller) {
        this.options.onStateChange('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.closedByCaller = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.reconnectAttempt = 0;
    socket?.close();
    this.options.onStateChange('closed');
  }

  private scheduleReconnect(): void {
    this.options.onStateChange('reconnecting');
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
