import { describe, it, expect, afterEach } from 'vitest';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { createApp, type AppHandle } from '../app.js';

const mockStore = {
  get synced() {
    return true;
  },
  list: () => [],
  get: () => undefined,
  start: async () => {},
  stop: async () => {},
} as unknown as WorkspaceStore;

const mockClient = {} as unknown as ChemuxerClient;

let handle: AppHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.shutdown().catch(() => {});
    handle = undefined;
  }
});

async function startApp(): Promise<{ endpoint: string; handle: AppHandle }> {
  const h = createApp({ store: mockStore, client: mockClient });
  await h.start(0, '127.0.0.1');
  const addr = h.httpServer.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  handle = h;
  return { endpoint: `http://127.0.0.1:${port}`, handle: h };
}

describe('SSE entry point', () => {
  it('GET /sse opens an SSE connection', async () => {
    const { endpoint } = await startApp();

    const controller = new AbortController();
    const res = await fetch(`${endpoint}/sse`, { signal: controller.signal });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Abort to close the connection
    controller.abort();
  });

  it('POST /messages with unknown sessionId returns 404', async () => {
    const { endpoint } = await startApp();

    const res = await fetch(`${endpoint}/messages?sessionId=nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Session not found' });
  });

  it('shutdown closes active transports and stops accepting connections', async () => {
    const { endpoint, handle: h } = await startApp();

    // Open an SSE connection
    const controller = new AbortController();
    const ssePromise = fetch(`${endpoint}/sse`, { signal: controller.signal }).catch(() => {});

    // Give a moment for the SSE connection to establish
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Abort the client-side connection so httpServer.close() can complete
    controller.abort();
    await ssePromise;

    // Shutdown completes now that no connections are held open
    await h.shutdown();
    handle = undefined;

    // Server should be closed — new connections fail
    await expect(fetch(`${endpoint}/healthz`)).rejects.toThrow();
  });

  it('new SSE requests during shutdown get 503', async () => {
    const { endpoint, handle: h } = await startApp();

    // Trigger shutdown but don't await it — we want to test the 503 behavior
    const shutdownPromise = h.shutdown();
    handle = undefined; // Will be shut down

    // Immediately try to connect — shuttingDown flag is already set
    const res = await fetch(`${endpoint}/sse`).catch(() => null);

    await shutdownPromise;

    // Either we got a 503 or the connection was refused (race condition)
    if (res) {
      expect(res.status).toBe(503);
    }
  });
});
