import { useCallback, useRef } from 'react';
import { useChatStore } from '../store/chat';

/**
 * Hook for streaming responses from the GeoLang AI agent via SSE.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const { addMessage, appendToLast, setStreaming } = useChatStore();

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
        const res = await fetch('/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
          signal: controller.signal,
        });

        if (!res.ok) {
          appendToLast(`[Error: ${res.status} ${res.statusText}]`);
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          appendToLast('[Error: No response body]');
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  appendToLast(parsed.content);
                }
              } catch {
                // Non-JSON SSE data — append raw
                appendToLast(data);
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          appendToLast(`\n\n[Error: ${(err as Error).message}]`);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, appendToLast, setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { send, abort };
}
