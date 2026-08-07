import {
  applyDocumentKey,
  emptyLiveDocument,
  type AppliedOperation,
  type ClientBatchMessage,
  type ClientMessage,
  type ClientOperationMessage,
  type ClientPresenceMessage,
  type LiveDocument,
  type LiveOperation,
  type LivePeer,
  type ServerMessage,
  type ServerOperationMessage,
} from '../../../src/live/types';

let installedServer: FakeAgoraServer | null = null;

/** every client frame that carries operations, whichever shape it took */
type ClientEditMessage = ClientOperationMessage | ClientBatchMessage;

function operationsOf(message: ClientEditMessage): LiveOperation[] {
  return message.type === 'op' ? [{ key: message.key, value: message.value }] : message.ops;
}

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

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
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

  /** the bearer the client offered behind the subprotocol marker */
  get offeredToken(): string | null {
    const offered = Array.isArray(this.protocols) ? this.protocols : [];
    return offered[0] === 'bearer' ? (offered[1] ?? null) : null;
  }

  get sinceParameter(): number {
    return Number(this.parameter('since'));
  }

  get operationsSent(): ClientOperationMessage[] {
    return this.sentMessages.filter(
      (message): message is ClientOperationMessage => message.type === 'op',
    );
  }

  get batchesSent(): ClientBatchMessage[] {
    return this.sentMessages.filter(
      (message): message is ClientBatchMessage => message.type === 'batch',
    );
  }

  get editsSent(): ClientEditMessage[] {
    return this.sentMessages.filter(
      (message): message is ClientEditMessage => message.type !== 'presence',
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
  accept(options: { replay?: boolean; actor?: string } = {}): FakeSocket {
    const connection = this.connection;
    connection.acceptHandshake();
    if (options.replay) {
      for (const entry of this.log.filter((entry) => entry.seq > connection.sinceParameter)) {
        connection.deliver(entry);
      }
      return connection;
    }
    // the real server always stamps the snapshot with the caller's identity
    connection.deliver({
      type: 'snapshot',
      seq: this.seq,
      state: this.document,
      actor: options.actor ?? 'self',
      role: 'edit',
    });
    return connection;
  }

  sendPeers(peers: LivePeer[]): void {
    for (const connection of this.openConnections) connection.deliver({ type: 'peers', peers });
  }

  /** an edit from another client, ordered by the server and broadcast */
  applyFromPeer(actor: string, key: string, value: unknown): ServerMessage {
    return this.commit(actor, [{ key, value }], null);
  }

  /** several edits from another client, ordered and broadcast as one frame */
  applyBatchFromPeer(actor: string, operations: LiveOperation[]): ServerMessage {
    return this.commit(actor, operations, null);
  }

  receiveFromClient(connection: FakeSocket, message: ClientMessage): void {
    if (message.type === 'presence') {
      for (const other of this.openConnections) {
        if (other !== connection) other.deliver({ type: 'presence', actor: 'client', ...message });
      }
      return;
    }
    if (!this.autoAck) return;
    this.commit('client', operationsOf(message), connection);
    connection.deliver({ type: 'ack', clientSeq: message.clientSeq, seq: this.seq });
  }

  ackPending(connection: FakeSocket, clientSeq: number): void {
    const sent = connection.editsSent.find((candidate) => candidate.clientSeq === clientSeq);
    if (!sent) throw new Error(`no operation sent with clientSeq ${clientSeq}`);
    this.commit('client', operationsOf(sent), connection);
    connection.deliver({ type: 'ack', clientSeq, seq: this.seq });
  }

  private get openConnections(): FakeSocket[] {
    return this.connections.filter((connection) => connection.readyState === FakeSocket.OPEN);
  }

  /**
   * Order the operations, one seq each, and relay them as a single frame. The
   * log keeps them apart, because a reconnect replays a batch op by op.
   */
  private commit(
    actor: string,
    operations: LiveOperation[],
    origin: FakeSocket | null,
  ): ServerMessage {
    const applied: AppliedOperation[] = [];
    for (const operation of operations) {
      this.seq += 1;
      this.document = applyDocumentKey(this.document, operation.key, operation.value);
      applied.push({ seq: this.seq, key: operation.key, value: operation.value });
      this.log.push({ type: 'op', seq: this.seq, actor, ...operation });
    }

    const [single] = applied;
    const frame: ServerMessage =
      applied.length === 1
        ? { type: 'op', seq: single.seq, actor, key: single.key, value: single.value }
        : { type: 'batch', actor, ops: applied };
    for (const connection of this.openConnections) {
      if (connection !== origin) connection.deliver(frame);
    }
    return frame;
  }
}
