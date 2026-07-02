import { describe, it, expect, afterEach, vi } from 'vitest';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { DirectEndpointResolver } from '../endpoint-resolver.js';
import { createApp, type AppHandle } from '../app.js';
import { rawHttpK8sAuth } from '@che-incubator/k8s-mcp-auth';

const resolver = new DirectEndpointResolver();

const mockStore = {
  get synced() { return true; },
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

async function startAuthApp(): Promise<string> {
  const mockReviewToken = vi.fn().mockResolvedValue({
    authenticated: true,
    user: 'test-user',
    groups: ['system:authenticated'],
  });
  const mockCheckAccess = vi.fn().mockResolvedValue(true);

  const authMiddleware = rawHttpK8sAuth({
    publicPaths: [
      { method: 'GET', path: '/healthz' },
      { method: 'GET', path: '/readyz' },
    ],
    namespace: 'test-ns',
    k8sClient: {
      reviewToken: mockReviewToken,
      checkAccess: mockCheckAccess,
    },
  });

  const h = createApp({ store: mockStore, client: mockClient, resolver, authMiddleware });
  await h.start(0, '127.0.0.1');
  const addr = h.httpServer.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  handle = h;
  return `http://127.0.0.1:${port}`;
}

describe('Auth-enabled server', () => {
  it('returns 401 for unauthenticated POST /mcp', async () => {
    const endpoint = await startAuthApp();
    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('bypasses auth for GET /healthz', async () => {
    const endpoint = await startAuthApp();
    const res = await fetch(`${endpoint}/healthz`);
    expect(res.status).toBe(200);
  });

  it('bypasses auth for GET /readyz', async () => {
    const endpoint = await startAuthApp();
    const res = await fetch(`${endpoint}/readyz`);
    expect(res.status).toBe(200);
  });

  it('passes through with valid bearer token', async () => {
    const endpoint = await startAuthApp();
    const res = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': 'Bearer valid-token',
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
  });
});
