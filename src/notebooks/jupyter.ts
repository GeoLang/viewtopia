/**
 * Jupyter Kernel Gateway client — connects to a remote Jupyter kernel
 * via WebSocket (Jupyter Messaging Protocol).
 *
 * Supports:
 * - Connecting to Jupyter Kernel Gateway or JupyterHub
 * - Executing Python code cells
 * - Receiving rich outputs (text, HTML, images, errors)
 * - Kernel lifecycle management (interrupt, restart)
 */

/** Jupyter message header */
interface JupyterHeader {
  msg_id: string;
  msg_type: string;
  username: string;
  session: string;
  date: string;
  version: string;
}

/** Jupyter message envelope */
interface JupyterMessage {
  header: JupyterHeader;
  parent_header: JupyterHeader | Record<string, never>;
  metadata: Record<string, unknown>;
  content: Record<string, unknown>;
  channel: string;
}

/** Output from a Jupyter execution */
export interface JupyterOutput {
  type: 'stdout' | 'stderr' | 'result' | 'display' | 'error' | 'image' | 'html';
  data: string;
  metadata?: Record<string, unknown>;
}

/** Kernel connection state */
export type KernelStatus = 'disconnected' | 'connecting' | 'idle' | 'busy' | 'error';

/** Kernel connection configuration */
export interface KernelConfig {
  /** Base URL of the Jupyter server (e.g. http://localhost:8888) */
  baseUrl: string;
  /** Authentication token */
  token: string;
  /** Kernel ID (if connecting to an existing kernel) */
  kernelId?: string;
  /** Kernel name for creating a new kernel (default: python3) */
  kernelName?: string;
}

type OutputCallback = (outputs: JupyterOutput[]) => void;
type StatusCallback = (status: KernelStatus) => void;

/**
 * Jupyter kernel client — manages WebSocket connection and code execution.
 */
export class JupyterKernelClient {
  private ws: WebSocket | null = null;
  private config: KernelConfig;
  private sessionId: string;
  private kernelId: string | null = null;
  private status: KernelStatus = 'disconnected';
  private statusListeners: Set<StatusCallback> = new Set();
  private pendingExecutions: Map<string, { resolve: (outputs: JupyterOutput[]) => void; outputs: JupyterOutput[] }> = new Map();

  constructor(config: KernelConfig) {
    this.config = config;
    this.sessionId = crypto.randomUUID().replace(/-/g, '');
  }

  /** Get current kernel status */
  getStatus(): KernelStatus {
    return this.status;
  }

  /** Subscribe to status changes */
  onStatusChange(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => { this.statusListeners.delete(cb); };
  }

  private setStatus(status: KernelStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  /** Connect to the kernel (start a new one or attach to existing) */
  async connect(): Promise<void> {
    this.setStatus('connecting');

    try {
      // Start or get kernel
      if (this.config.kernelId) {
        this.kernelId = this.config.kernelId;
      } else {
        this.kernelId = await this.startKernel();
      }

      // Connect WebSocket
      const wsUrl = this.buildWsUrl();
      this.ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject(new Error('No WebSocket'));
        this.ws.onopen = () => resolve();
        this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      });

      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = () => this.setStatus('disconnected');
      this.ws.onerror = () => this.setStatus('error');

      this.setStatus('idle');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /** Disconnect from the kernel */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** Execute Python code and return outputs */
  async execute(code: string): Promise<JupyterOutput[]> {
    if (!this.ws || this.status === 'disconnected') {
      throw new Error('Not connected to kernel');
    }

    const msgId = crypto.randomUUID().replace(/-/g, '');

    const msg: JupyterMessage = {
      header: {
        msg_id: msgId,
        msg_type: 'execute_request',
        username: 'viewtopia',
        session: this.sessionId,
        date: new Date().toISOString(),
        version: '5.3',
      },
      parent_header: {},
      metadata: {},
      content: {
        code,
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true,
      },
      channel: 'shell',
    };

    this.ws.send(JSON.stringify(msg));
    this.setStatus('busy');

    return new Promise((resolve) => {
      this.pendingExecutions.set(msgId, { resolve, outputs: [] });
    });
  }

  /** Interrupt the running kernel */
  async interrupt(): Promise<void> {
    if (!this.kernelId) return;
    const url = `${this.config.baseUrl}/api/kernels/${this.kernelId}/interrupt`;
    await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
    });
  }

  /** Restart the kernel */
  async restart(): Promise<void> {
    if (!this.kernelId) return;
    const url = `${this.config.baseUrl}/api/kernels/${this.kernelId}/restart`;
    await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    this.setStatus('idle');
  }

  /** Shutdown the kernel */
  async shutdown(): Promise<void> {
    if (!this.kernelId) return;
    this.disconnect();
    const url = `${this.config.baseUrl}/api/kernels/${this.kernelId}`;
    await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    this.kernelId = null;
  }

  // ─── Private methods ────────────────────────────────────────────────

  private async startKernel(): Promise<string> {
    const url = `${this.config.baseUrl}/api/kernels`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.config.kernelName ?? 'python3' }),
    });
    if (!resp.ok) throw new Error(`Failed to start kernel: ${resp.status}`);
    const data = await resp.json();
    return data.id;
  }

  private buildWsUrl(): string {
    const base = this.config.baseUrl.replace(/^http/, 'ws');
    return `${base}/api/kernels/${this.kernelId}/channels?token=${encodeURIComponent(this.config.token)}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `token ${this.config.token}` };
  }

  private handleMessage(event: MessageEvent) {
    let msg: JupyterMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const parentMsgId = (msg.parent_header as JupyterHeader)?.msg_id;
    const pending = parentMsgId ? this.pendingExecutions.get(parentMsgId) : undefined;

    switch (msg.header.msg_type) {
      case 'stream': {
        const output: JupyterOutput = {
          type: msg.content.name === 'stderr' ? 'stderr' : 'stdout',
          data: String(msg.content.text),
        };
        pending?.outputs.push(output);
        break;
      }

      case 'execute_result':
      case 'display_data': {
        const data = msg.content.data as Record<string, string> | undefined;
        if (data) {
          if (data['image/png']) {
            pending?.outputs.push({ type: 'image', data: `data:image/png;base64,${data['image/png']}` });
          } else if (data['text/html']) {
            pending?.outputs.push({ type: 'html', data: data['text/html'] });
          } else if (data['text/plain']) {
            pending?.outputs.push({ type: 'result', data: data['text/plain'] });
          }
        }
        break;
      }

      case 'error': {
        const traceback = (msg.content.traceback as string[])?.join('\n') ?? String(msg.content.evalue);
        pending?.outputs.push({ type: 'error', data: traceback });
        break;
      }

      case 'status': {
        const execState = msg.content.execution_state as string;
        if (execState === 'idle') {
          this.setStatus('idle');
          // If there's a pending execution, resolve it
          if (pending && parentMsgId) {
            pending.resolve(pending.outputs);
            this.pendingExecutions.delete(parentMsgId);
          }
        } else if (execState === 'busy') {
          this.setStatus('busy');
        }
        break;
      }
    }
  }
}

/** Singleton kernel client (one per ViewTopia session) */
let kernelClient: JupyterKernelClient | null = null;

export function getKernelClient(): JupyterKernelClient | null {
  return kernelClient;
}

export function createKernelClient(config: KernelConfig): JupyterKernelClient {
  if (kernelClient) {
    kernelClient.disconnect();
  }
  kernelClient = new JupyterKernelClient(config);
  return kernelClient;
}

export function disconnectKernel(): void {
  if (kernelClient) {
    kernelClient.disconnect();
    kernelClient = null;
  }
}
