import { vi } from 'vitest';

export interface ElementServerAnswer {
  status?: number;
  body?: unknown;
  networkFailure?: boolean;
}

export interface ElementServerRequest {
  url: URL;
  path: string;
  authorization: string | undefined;
}

type Answerer = (request: ElementServerRequest) => ElementServerAnswer;

export class FakeElementServer {
  requests: ElementServerRequest[] = [];
  answer: Answerer = () => ({ status: 404, body: { code: 'ResourceNotFound', message: 'no route' } });

  install(): void {
    const server = this;
    class FakeXhr {
      responseType = '';
      response: unknown = undefined;
      status = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private url = '';
      private headers: Record<string, string> = {};

      open(_method: string, url: string) {
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      getAllResponseHeaders() {
        return '';
      }
      abort() {}
      send() {
        const url = new URL(this.url, window.location.origin);
        const request = {
          url,
          path: decodeURIComponent(url.pathname),
          authorization: this.headers.Authorization,
        };
        server.requests.push(request);
        const answer = server.answer(request);
        queueMicrotask(() => {
          if (answer.networkFailure) {
            this.onerror?.();
            return;
          }
          this.status = answer.status ?? 200;
          this.response =
            typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {});
          this.onload?.();
        });
      }
    }
    // cesium's Resource loads through XMLHttpRequest
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  }

  restore(): void {
    vi.unstubAllGlobals();
  }

  requestsTo(path: string): ElementServerRequest[] {
    return this.requests.filter((request) => request.path === path);
  }
}

export function fakeTileFeature(properties: Record<string, unknown>) {
  const getProperty = (name: string) => properties[name];
  return { getProperty, getPropertyInherited: getProperty, getPropertyIds: () => Object.keys(properties) };
}
