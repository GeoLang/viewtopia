/** jsdom has no BroadcastChannel, and the story presenter talks over one. */

type Listener = (event: { data: unknown }) => void;

class FakeBroadcastChannel {
  static open: FakeBroadcastChannel[] = [];
  onmessage: Listener | null = null;

  constructor(readonly name: string) {
    FakeBroadcastChannel.open.push(this);
  }

  /** delivered synchronously, so tests wrap sends in `act` */
  postMessage(data: unknown): void {
    for (const other of FakeBroadcastChannel.open) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data });
    }
  }

  close(): void {
    FakeBroadcastChannel.open = FakeBroadcastChannel.open.filter((channel) => channel !== this);
  }
}

export function installFakeBroadcastChannel(): void {
  FakeBroadcastChannel.open = [];
  globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
}

/** A standalone endpoint on the channel, standing in for the other window. */
export function fakeChannelPeer(name: string) {
  const channel = new FakeBroadcastChannel(name);
  const received: unknown[] = [];
  channel.onmessage = (event) => {
    received.push(event.data);
  };
  return {
    received,
    send: (data: unknown) => channel.postMessage(data),
    close: () => channel.close(),
  };
}
