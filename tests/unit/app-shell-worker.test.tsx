import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { shownNotifications } = vi.hoisted(() => ({
  shownNotifications: [] as { message: React.ReactNode }[],
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (notification: { message: React.ReactNode }) => shownNotifications.push(notification) },
}));

import { registerAppShellWorker } from '../../src/offline/appShellWorker';
import { useNetworkStore } from '../../src/offline/network';

class FakeWorker extends EventTarget {
  state = 'installing';
  posted: unknown[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  moveTo(state: string) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn(async () => {});
  unregister = vi.fn(async () => true);

  beginInstall(): FakeWorker {
    this.installing = new FakeWorker();
    this.dispatchEvent(new Event('updatefound'));
    return this.installing;
  }

  finishInstall(worker: FakeWorker) {
    this.waiting = worker;
    worker.moveTo('installed');
  }
}

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

let registration: FakeRegistration;
let existing: FakeRegistration[];
// the module listens on the shared document, so every test drives its own
// handler rather than dispatching to the ones earlier tests left behind
let visibilityHandlers: EventListener[];
let container: EventTarget & {
  controller: unknown;
  register: ReturnType<typeof vi.fn>;
  getRegistrations: ReturnType<typeof vi.fn>;
};

function asRegistration(fake: FakeRegistration): ServiceWorkerRegistration {
  return fake as unknown as ServiceWorkerRegistration;
}

beforeEach(() => {
  shownNotifications.length = 0;
  registration = new FakeRegistration();
  existing = [new FakeRegistration()];
  container = Object.assign(new EventTarget(), {
    controller: null as unknown,
    register: vi.fn(async () => asRegistration(registration)),
    getRegistrations: vi.fn(async () => existing.map(asRegistration)),
  });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  useNetworkStore.setState({ online: true });

  visibilityHandlers = [];
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
    if (type === 'visibilitychange') visibilityHandlers.push(handler as EventListener);
    addEventListener(type, handler as EventListener, options);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const becomeVisible = () => {
  for (const handler of visibilityHandlers) handler(new Event('visibilitychange'));
};

const clickReload = () => {
  const [notification] = shownNotifications;
  render(<MantineProvider>{notification.message}</MantineProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
};

describe('registerAppShellWorker', () => {
  it('registers the generated worker in a production build', async () => {
    vi.stubEnv('DEV', false);

    registerAppShellWorker();

    await vi.waitFor(() => expect(container.register).toHaveBeenCalledWith('/sw.js'));
  });

  it('tears down a leftover worker in dev instead of registering one', async () => {
    registerAppShellWorker();

    await vi.waitFor(() => expect(existing[0].unregister).toHaveBeenCalled());
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing on an insecure origin, where the api is there but undefined', () => {
    vi.stubEnv('DEV', false);
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });

    expect(() => registerAppShellWorker()).not.toThrow();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('prompts to reload when a new build finishes installing behind the open one', async () => {
    vi.stubEnv('DEV', false);
    container.controller = {};

    registerAppShellWorker();
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());

    const installing = registration.beginInstall();
    registration.finishInstall(installing);

    expect(shownNotifications).toHaveLength(1);
  });

  it('stays quiet on the very first install, when no build is being replaced', async () => {
    vi.stubEnv('DEV', false);
    container.controller = null;

    registerAppShellWorker();
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());

    const installing = registration.beginInstall();
    registration.finishInstall(installing);

    expect(shownNotifications).toHaveLength(0);
  });

  it('hands the waiting worker over when the reload button is clicked', async () => {
    vi.stubEnv('DEV', false);
    registration.waiting = new FakeWorker();

    registerAppShellWorker();
    await vi.waitFor(() => expect(shownNotifications).toHaveLength(1));

    clickReload();

    expect(registration.waiting.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('re-prompts a tab that dismissed the notice, when it comes back into view', async () => {
    vi.stubEnv('DEV', false);

    registerAppShellWorker();
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());

    registration.waiting = new FakeWorker();
    becomeVisible();

    await vi.waitFor(() => expect(shownNotifications).toHaveLength(1));
    expect(registration.update).toHaveBeenCalled();
  });

  it('skips the update poll while offline', async () => {
    vi.stubEnv('DEV', false);
    useNetworkStore.setState({ online: false });

    registerAppShellWorker();
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());

    becomeVisible();

    await Promise.resolve();
    expect(registration.update).not.toHaveBeenCalled();
  });
});

const generatedWorkerPath = resolve(process.cwd(), 'dist/sw.js');

describe.skipIf(!existsSync(generatedWorkerPath))('generated precache manifest', () => {
  const precachedUrls = () => {
    const source = readFileSync(generatedWorkerPath, 'utf8');
    return [...source.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
  };

  it('covers every subresource the built index.html loads at boot', () => {
    const html = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
    const referenced = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((match) => match[1]);
    const urls = precachedUrls();

    expect(urls).toContain('index.html');
    expect(referenced.length).toBeGreaterThan(4);
    for (const path of referenced) {
      // offline/network.ts pings it to tell online from offline
      if (path === 'manifest.json') continue;
      expect(urls).toContain(path);
    }
  });

  it('leaves the caches that src/offline already owns alone', () => {
    const urls = precachedUrls();

    expect(urls).not.toContain('manifest.json');
    expect(urls.some((url) => url.endsWith('.wasm'))).toBe(false);
    expect(urls.some((url) => url.includes('duckdb'))).toBe(false);
    expect(urls.some((url) => url.startsWith('basemaps-assets/'))).toBe(false);
    expect(urls.some((url) => url.startsWith('cesium/Assets/'))).toBe(false);
    expect(urls.some((url) => url.startsWith('cesium/Workers/'))).toBe(false);
  });
});
