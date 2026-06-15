import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import express from 'express';
import { SessionManager } from '../session-manager.js';
import { FeedCollector } from '../feed-collector.js';
import { createApiRouter } from '../api-routes.js';
import { DEFAULT_SETTINGS } from '../../../shared/settings.js';

function mockSettingsManager() {
  return {
    getSettings: () => DEFAULT_SETTINGS,
    onChange: () => {},
    dispose: () => {},
    getSchemaString: () => '{}',
    writeSettings: () => DEFAULT_SETTINGS,
  } as any;
}

describe('API Routes', { timeout: 30000 }, () => {
  let server: http.Server;
  let manager: SessionManager;
  let feedCollector: FeedCollector;
  let baseUrl: string;
  let broadcasts: object[];

  beforeEach(async () => {
    broadcasts = [];
    manager = new SessionManager(mockSettingsManager());
    feedCollector = new FeedCollector(manager, { intervalMs: 60000, maxEntries: 10 });
    const broadcastControl = (data: object) => { broadcasts.push(data); };
    manager.setBroadcastControl(broadcastControl);

    const app = express();
    app.use(express.json());
    app.use(createApiRouter(manager, feedCollector, broadcastControl));

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;
  });

  afterEach(async () => {
    feedCollector.stop();
    manager.closeAll();
    await new Promise(r => setTimeout(r, 100));
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      setTimeout(resolve, 1000);
    });
  });

  // --- agents.md ---
  it('GET /agents.md returns markdown', async () => {
    const res = await fetch(`${baseUrl}/agents.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const body = await res.text();
    expect(body).toContain('Chemuxer');
    expect(body).toContain('/api/sessions');
  });

  it('GET /.well-known/agents.md returns same content as /agents.md', async () => {
    const [res, wellKnownRes] = await Promise.all([
      fetch(`${baseUrl}/agents.md`),
      fetch(`${baseUrl}/.well-known/agents.md`),
    ]);
    expect(wellKnownRes.status).toBe(200);
    expect(wellKnownRes.headers.get('content-type')).toContain('text/markdown');
    const [body, wellKnownBody] = await Promise.all([res.text(), wellKnownRes.text()]);
    expect(wellKnownBody).toBe(body);
  });

  // --- Session CRUD ---
  it('GET /api/sessions returns empty array initially', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('POST /api/sessions creates a session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.shell).toBeTruthy();
    expect(body.title).toBeTruthy();
    expect(body.createdAt).toBeGreaterThan(0);
  });

  it('POST /api/sessions broadcasts session-created', async () => {
    await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    expect(broadcasts).toHaveLength(1);
    expect((broadcasts[0] as any).type).toBe('session-created');
  });

  it('GET /api/sessions/:id returns session info', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
  });

  it('GET /api/sessions/:id returns 404 for unknown ID', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('DELETE /api/sessions/:id closes and removes session', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const getRes = await fetch(`${baseUrl}/api/sessions/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /api/sessions/:id broadcasts session-closed', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    broadcasts = [];
    await fetch(`${baseUrl}/api/sessions/${id}`, { method: 'DELETE' });
    const relevant = broadcasts.filter((b: any) => b.sessionId === id && b.type === 'session-closed');
    expect(relevant).toHaveLength(1);
  });

  it('DELETE /api/sessions/:id returns 404 for unknown ID', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/sessions/:id renames session', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'my build' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('my build');
    expect(body.renamed).toBe(true);
  });

  it('PATCH /api/sessions/:id broadcasts session-renamed', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    broadcasts = [];
    await fetch(`${baseUrl}/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'renamed' }),
    });
    expect(broadcasts).toHaveLength(1);
    expect((broadcasts[0] as any).type).toBe('session-renamed');
  });

  it('PATCH /api/sessions/:id returns 404 for unknown ID', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/sessions/:id returns 400 without title', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // --- Terminal I/O ---
  it('GET /api/sessions/:id/buffer returns terminal content', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    await new Promise(r => setTimeout(r, 300));
    const res = await fetch(`${baseUrl}/api/sessions/${id}/buffer`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.content).toBe('string');
  });

  it('GET /api/sessions/:id/buffer returns 404 for unknown ID', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent/buffer`);
    expect(res.status).toBe(404);
  });

  it('POST /api/sessions/:id/input sends data to PTY', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'echo agent-test\r' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    await new Promise(r => setTimeout(r, 500));
    const bufferRes = await fetch(`${baseUrl}/api/sessions/${id}/buffer`);
    const { content } = await bufferRes.json();
    expect(content).toContain('agent-test');
  });

  it('POST /api/sessions/:id/input returns 404 for unknown ID', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/sessions/:id/input returns 400 without data field', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/sessions/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // --- Feed ---
  it('GET /api/sessions/:id/feed returns feed entries', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { id } = await createRes.json();
    await new Promise(r => setTimeout(r, 300));
    feedCollector.tick();
    const res = await fetch(`${baseUrl}/api/sessions/${id}/feed`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(body.nextSince).toBeTruthy();
  });

  it('GET /api/feed returns global feed', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    await createRes.json();
    await new Promise(r => setTimeout(r, 300));
    feedCollector.tick();
    const res = await fetch(`${baseUrl}/api/feed`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(body.nextSince).toBeTruthy();
  });

  it('GET /api/feed supports since query param', async () => {
    const since = new Date().toISOString();
    const res = await fetch(`${baseUrl}/api/feed?since=${since}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
  });

  it('GET /api/sessions lists sessions after POST', async () => {
    await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});
