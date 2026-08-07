import {
  applyDocumentKey,
  emptyLiveDocument,
  type ClientMessage,
  type ClientOperationMessage,
  type ClientPresenceMessage,
  type LiveDocument,
  type LivePeer,
  type ServerMessage,
  type ServerOperationMessage,
} from '../../../src/live/types';

let installedServer: FakeAgoraServer | null = null;

export class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sentMessages: ClientMessage[] = [];
  private readonly server: FakeAgoraServer;

  constructor(readonly url: string) {
    if (!installedServer) throw new Error('no fake agora server installed');
    this.server = installedServer;
    this.server.connections.push(this);
  }

  send(raw: string): void {
    const message = JSON.parse(raw) as ClientMessage;
    this.sentMessages.push(message);
    this.server.receiveFromClient(this, message);
  }

  close(): void {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  acceptHandshake(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  deliver(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  dropConnection(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  private parameter(name: string): string | null {
    return new URL(this.url).searchParams.get(name);
  }

  get documentParameter(): string | null {
    return this.parameter('doc');
  }

  get tokenParameter(): string | null {
    return this.parameter('token');
  }

  get sinceParameter(): number {
    return Number(this.parameter('since'));
  }

  get operationsSent(): ClientOperationMessage[] {
    return this.sentMessages.filter(
      (message): message is ClientOperationMessage => message.type === 'op',
    );
  }

  get presenceSent(): ClientPresenceMessage[] {
    return this.sentMessages.filter(
      (message): message is ClientPresenceMessage => message.type === 'presence',
    );
  }
}

/**
 * The pinned agora protocol, server side: monotonic seq per document,
 * last writer wins per key, ack to the sender and the op to everyone else.
 */
export class FakeAgoraServer {
  readonly connections: FakeSocket[] = [];
  readonly log: ServerOperationMessage[] = [];
  document: LiveDocument = emptyLiveDocument('shared map');
  seq = 0;
  autoAck = true;
  private previousWebSocket: typeof WebSocket | undefined;

  install(): void {
    installedServer = this;
    this.previousWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  }

  restore(): void {
    if (this.previousWebSocket) globalThis.WebSocket = this.previousWebSocket;
    installedServer = null;
  }

  get connection(): FakeSocket {
    const latest = this.connections.at(-1);
    if (!latest) throw new Error('no client connected');
    return latest;
  }

  /** complete the handshake, then either replay from since or send a snapshot */
  accept(options: { replay?: boolean } = {}): FakeSocket {
    const connection = this.connection;
    connection.acceptHandshake();
    if (options.replay) {
      for (const entry of this.log.filter((entry) => entry.seq > connection.sinceParameter)) {
        connection.deliver(entry);
      }
      return connection;
    }
    connection.deliver({ type: 'snapshot', seq: this.seq, state: this.document });
    return connection;
  }

  sendPeers(peers: LivePeer[]): void {
    for (const connection of this.openConnections) connection.deliver({ type: 'peers', peers });
  }

  /** an edit from another client, ordered by the server and broadcast */
  applyFromPeer(actor: string, key: string, value: unknown): ServerOperationMessage {
    return this.commit(actor, key, value, null);
  }

  receiveFromClient(connection: FakeSocket, message: ClientMessage): void {
    if (message.type === 'presence') {
      for (const other of this.openConnections) {
        if (other !== connection) other.deliver({ type: 'presence', actor: 'client', ...message });
      }
      return;
    }
    if (!this.autoAck) return;
    this.commit('client', message.key, message.value, connection);
    connection.deliver({ type: 'ack', clientSeq: message.clientSeq, seq: this.seq });
  }

  ackPending(connection: FakeSocket, clientSeq: number): void {
    const operation = connection.operationsSent.find(
      (candidate) => candidate.clientSeq === clientSeq,
    );
    if (!operation) throw new Error(`no operation sent with clientSeq ${clientSeq}`);
    this.commit('client', operation.key, operation.value, connection);
    connection.deliver({ type: 'ack', clientSeq, seq: this.seq });
  }

  private get openConnections(): FakeSocket[] {
    return this.connections.filter((connection) => connection.readyState === FakeSocket.OPEN);
  }

  private commit(
    actor: string,
    key: string,
    value: unknown,
    origin: FakeSocket | null,
  ): ServerOperationMessage {
    this.seq += 1;
    this.document = applyDocumentKey(this.document, key, value);
    const frame: ServerOperationMessage = { type: 'op', seq: this.seq, actor, key, value };
    this.log.push(frame);
    for (const connection of this.openConnections) {
      if (connection !== origin) connection.deliver(frame);
    }
    return frame;
  }
}
