import { useCallback, useRef } from 'react';
import { useChatStore } from '../store/chat';
import { executeViewerCommand } from '../viewer/commands';

/**
 * Hook for streaming responses from the GeoLang AI agent via SSE.
 *
 * Speaks the real backend protocol (POST /agent/chat/stream, SSE lines of
 * `data: {type, ...}`): `progress` | `text` | `viewer_cmd` | `followups` |
 * `done` | `error`. `viewer_cmd` events drive the map via executeViewerCommand.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const { addMessage, setLastContent, setStreaming } = useChatStore();

  const send = useCallback(
    async (prompt: string) => {
      // Add user message
      addMessage({ role: 'user', content: prompt });

      // Start assistant placeholder
      addMessage({ role: 'assistant', content: '' });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/agent/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setLastContent(`[Error: ${res.status} ${res.statusText}]`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setLastContent('[Error: No response body]');
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let lastText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            let event: { type?: string; text?: string; cmd?: { action: string; params?: Record<string, unknown> } };
            try {
              event = JSON.parse(data);
            } catch {
              // Non-JSON line — treat as raw text
              lastText += data;
              setLastContent(lastText);
              continue;
            }
            switch (event.type) {
              case 'text':
                lastText = event.text ?? lastText;
                setLastContent(lastText);
                break;
              case 'progress':
                if (!lastText && event.text) setLastContent(`…${event.text}`);
                break;
              case 'viewer_cmd':
                if (event.cmd) executeViewerCommand(event.cmd);
                break;
              case 'error':
                setLastContent(`Error: ${event.text ?? 'unknown'}`);
                break;
              // 'followups' / 'done' — nothing extra to render here
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setLastContent(`[Error: ${(err as Error).message}]`);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, setLastContent, setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { send, abort };
}
