import { describe, it, expect, afterEach } from 'vitest';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { DirectEndpointResolver } from '../endpoint-resolver.js';
import { createApp, type AppHandle } from '../app.js';

const resolver = new DirectEndpointResolver();

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
  const h = createApp({ store: mockStore, client: mockClient, resolver });
  await h.start(0, '127.0.0.1');
  const addr = h.httpServer.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  handle = h;
  return { endpoint: `http://127.0.0.1:${port}`, handle: h };
}

describe('Streamable HTTP entry point', () => {
  it('POST /mcp with initialize request creates a session', async () => {
    const { endpoint } = await startApp();

    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('POST /mcp with unknown sessionId returns 404', async () => {
    const { endpoint } = await startApp();

    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': 'nonexistent',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toContain('Session not found');
  });

  it('POST /mcp without sessionId and non-initialize returns 400', async () => {
    const { endpoint } = await startApp();

    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(res.status).toBe(400);
  });

  it('shutdown closes active transports and stops accepting connections', async () => {
    const { endpoint, handle: h } = await startApp();

    await h.shutdown();
    handle = undefined;

    await expect(fetch(`${endpoint}/healthz`)).rejects.toThrow();
  });

  it('requests during shutdown get 503', async () => {
    const { endpoint, handle: h } = await startApp();

    const shutdownPromise = h.shutdown();
    handle = undefined;

    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.1' } } }),
    }).catch(() => null);

    await shutdownPromise;

    if (res) {
      expect(res.status).toBe(503);
    }
  });
});
