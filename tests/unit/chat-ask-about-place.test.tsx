import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// each run stays open until the test finishes it
const agentRuns = vi.hoisted(() => ({ prompts: [] as string[], finishers: [] as Array<() => void> }));

vi.mock('@ag-ui/client', () => ({
  HttpAgent: class {
    constructor(config: { initialMessages: Array<{ content: string }> }) {
      agentRuns.prompts.push(config.initialMessages[0].content);
    }
    runAgent() {
      return new Promise<void>((resolve) => agentRuns.finishers.push(resolve));
    }
  },
}));
vi.mock('../../src/lib/agentSessions', () => ({ ensureBackendSession: vi.fn(async () => {}) }));

import { ChatPanel } from '../../src/components/ChatPanel';
import { ContextMenu } from '../../src/components/ContextMenu';
import { useAppStore } from '../../src/store/app';
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

const QUESTION = 'What is at latitude 45.437191, longitude 12.334590?';

function rightClickVenice(): void {
  act(() => useAppStore.getState().showContextMenu({ x: 10, y: 10, lat: 45.4371908, lng: 12.3345898 }));
}

function renderChatAndMenu() {
  return render(
    <MantineProvider>
      <ChatPanel />
      <ContextMenu />
    </MantineProvider>,
  );
}

beforeEach(() => {
  agentRuns.prompts = [];
  agentRuns.finishers = [];
  useChatStore.setState({ sessions: [], activeSessionId: null, streaming: false, followUp: null, queuedPrompt: null });
  useAppStore.getState().hideContextMenu();
});

describe('ask the chat about a map point', () => {
  it('sends the clicked coordinates to the agent as a user prompt', async () => {
    renderChatAndMenu();
    rightClickVenice();

    fireEvent.click(screen.getByText('Ask the chat about this place'));

    await waitFor(() => expect(agentRuns.prompts).toEqual([QUESTION]));
    const userMessages = useChatStore.getState().activeMessages().filter((message) => message.role === 'user');
    expect(userMessages.map((message) => message.content)).toEqual([QUESTION]);
    expect(useAppStore.getState().contextMenu).toBeNull();
  });

  it('waits for the running reply to finish before sending', async () => {
    renderChatAndMenu();
    act(() => useChatStore.getState().setStreaming(true));
    rightClickVenice();

    fireEvent.click(screen.getByText('Ask the chat about this place'));
    expect(agentRuns.prompts).toEqual([]);

    act(() => useChatStore.getState().setStreaming(false));

    await waitFor(() => expect(agentRuns.prompts).toEqual([QUESTION]));
  });

  it('sends the question after the run for a waiting read result finishes', async () => {
    renderChatAndMenu();
    act(() => useChatStore.getState().setStreaming(true));
    act(() => useChatStore.getState().queueFollowUp('Result of list_layers: none'));
    rightClickVenice();
    fireEvent.click(screen.getByText('Ask the chat about this place'));

    act(() => useChatStore.getState().setStreaming(false));
    await waitFor(() => expect(agentRuns.prompts).toEqual(['Result of list_layers: none']));

    await act(async () => agentRuns.finishers[0]());
    await waitFor(() => expect(agentRuns.prompts).toEqual(['Result of list_layers: none', QUESTION]));
  });
});
