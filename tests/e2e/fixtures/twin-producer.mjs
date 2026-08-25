// A sensor producer for the digital twin spec: opens agora's ingest socket with
// a feed token and sends one readings frame per interval, until the spec stops it.

/** Marker for the token on a websocket handshake, see src/lib/apiAuth.ts. */
const BEARER_SUBPROTOCOL = 'bearer';

const READING_KIND = 'temperature';

const OPEN_TIMEOUT_MS = 10_000;

/**
 * Starts sending and answers a handle over it. `send` puts one frame out at
 * once, so the spec can drive a single value without waiting for a tick.
 */
export async function startProducer({ agoraUrl, feedToken, assetIds, intervalMs, valueFor }) {
  const url = `${agoraUrl.replace(/^http/, 'ws')}/feeds/ws`;
  const socket = new WebSocket(url, [BEARER_SUBPROTOCOL, feedToken]);
  const acks = [];
  const errors = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'ack') acks.push(message.count);
    else if (message.type === 'error') errors.push(message.reason);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`the producer could not open ${url}`)),
      OPEN_TIMEOUT_MS,
    );
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`the producer could not open ${url}`));
    });
  });

  const send = (readings) => {
    socket.send(JSON.stringify({ type: 'readings', readings }));
  };

  let tick = 0;
  const sendTick = () => {
    const at = new Date().toISOString();
    send(
      assetIds.map((asset) => ({
        asset,
        kind: READING_KIND,
        value: valueFor(asset, tick),
        at,
      })),
    );
    tick += 1;
  };

  sendTick();
  const timer = setInterval(sendTick, intervalMs);

  return {
    send,
    stop: () => {
      clearInterval(timer);
      socket.close();
    },
    acks,
    errors,
  };
}
