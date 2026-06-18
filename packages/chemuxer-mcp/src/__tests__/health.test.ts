import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import express from 'express';
import { createHealthRouter } from '../health.js';
import type { WorkspaceStore } from '../workspace-store.js';

// --- Test HTTP server ---

function createMockStore(synced: boolean): WorkspaceStore {
  return {
    get synced() {
      return synced;
    },
  } as WorkspaceStore;
}

async function withServer<T>(
  store: WorkspaceStore,
  fn: (endpoint: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(createHealthRouter(store));

  const server = createServer(app);

  return new Promise<T>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, async () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      const endpoint = `http://127.0.0.1:${port}`;

      try {
        const result = await fn(endpoint);
        server.close((err) => {
          if (err) reject(err);
          else resolve(result);
        });
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

// --- Tests ---

describe('health probes', () => {
  it('/healthz returns 200 with { ok: true }', async () => {
    await withServer(createMockStore(false), async (endpoint) => {
      const res = await fetch(`${endpoint}/healthz`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });
  });

  it('/readyz returns 200 when synced', async () => {
    await withServer(createMockStore(true), async (endpoint) => {
      const res = await fetch(`${endpoint}/readyz`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });
  });

  it('/readyz returns 503 when not synced', async () => {
    await withServer(createMockStore(false), async (endpoint) => {
      const res = await fetch(`${endpoint}/readyz`);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ ok: false, reason: 'Informer has not completed initial sync' });
    });
  });
});
