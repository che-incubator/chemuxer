import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import express from 'express';
import { SessionManager } from '../session-manager.js';
import { FeedCollector } from '../feed-collector.js';
import { createApiRouter } from '../api-routes.js';
import { DEFAULT_SETTINGS } from '@chemuxer/shared';
import { Session } from '../session.js';
import * as devfileCommandsModule from '../devfile-commands.js';

function mockSettingsManager() {
  return {
    getSettings: () => DEFAULT_SETTINGS,
    onChange: () => {},
    dispose: () => {},
    getSchemaString: () => '{}',
    writeSettings: () => DEFAULT_SETTINGS,
  } as any;
}

function mockDiscovery() {
  return {
    getContainers: async () => [
      { name: 'test-container', state: 'running' as const, ready: true, isDefault: true },
    ],
    getDefaultContainerName: () => 'test-container',
    getPodName: () => 'test-pod',
    getNamespace: () => 'test-namespace',
  } as any;
}

describe('API Routes', { timeout: 30000 }, () => {
  let server: http.Server;
  let manager: SessionManager;
  let feedCollector: FeedCollector;
  let baseUrl: string;
  let broadcasts: object[];
  let mockWrite: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    broadcasts = [];
    mockWrite = vi.fn();
    vi.spyOn(Session.prototype, 'write').mockImplementation(mockWrite);
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    feedCollector = new FeedCollector(manager, { intervalMs: 60000, maxEntries: 10 });
    const broadcastControl = (data: object) => { broadcasts.push(data); };
    manager.setBroadcastControl(broadcastControl);

    const app = express();
    app.use(express.json());
    app.use(createApiRouter(manager, mockSettingsManager(), feedCollector, broadcastControl, mockDiscovery()));

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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
    expect(mockWrite).toHaveBeenCalledWith('echo agent-test\r');
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

  it('GET /api/devfile-commands returns empty array when metadata file absent', async () => {
    const res = await fetch(`${baseUrl}/api/devfile-commands`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('GET /api/sessions lists sessions after POST', async () => {
    await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  // --- Settings ---
  it('GET /api/settings returns current settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DEFAULT_SETTINGS);
  });

  it('PUT /api/settings returns updated settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminal: { fontSize: 16 } }),
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/settings/schema returns JSON schema', async () => {
    const res = await fetch(`${baseUrl}/api/settings/schema`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  // --- Pin support ---
  describe('PATCH /api/sessions/:id (pin)', () => {
    it('pins a session', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pinned).toBe(true);
    });

    it('unpins a session', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      manager.pinSession(id, true);
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pinned).toBe(false);
    });

    it('returns 400 when pinned is not a boolean', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: 'yes' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/sessions/:id (pin guard)', () => {
    it('returns 409 for pinned session without force', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      manager.pinSession(id, true);
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('SESSION_PINNED');
    });

    it('closes pinned session with force=true', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      manager.pinSession(id, true);
      const res = await fetch(`${baseUrl}/api/sessions/${id}?force=true`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('closes unpinned session normally', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      const { id } = await createRes.json();
      const res = await fetch(`${baseUrl}/api/sessions/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/sessions (pinned option)', () => {
    it('creates session with pinned=true', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.pinned).toBe(true);
    });

    it('creates session defaults to unpinned', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.pinned).toBe(false);
    });
  });

  describe('POST /api/sessions with devfileCommandId', () => {
    beforeEach(() => {
      // Mock devfile commands to use 'test-container' which matches mockDiscovery's default
      vi.spyOn(devfileCommandsModule, 'loadDevfileCommands').mockReturnValue([
        {
          id: 'build-app',
          label: 'Build Application',
          component: 'test-container',
          commandLine: 'npm run build',
          group: 'build',
        },
        {
          id: 'test-unit',
          component: 'test-container',
          commandLine: 'npm test',
          workingDir: '/projects/app',
          group: 'test',
        },
      ]);
    });

    it('should create session and execute devfile command', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: 'build-app' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body).toMatchObject({
        id: expect.any(String),
        title: 'build: Build Application',
        shell: expect.any(String),
      });

      const session = manager.getSession(body.id);
      expect(session).toBeDefined();
      expect(session?.title).toBe('build: Build Application');
      expect(mockWrite).toHaveBeenCalledWith('npm run build\n');
    });

    it('should handle workingDir with cd command', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: 'test-unit' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('test: test-unit');

      const session = manager.getSession(body.id);
      expect(mockWrite).toHaveBeenCalledWith("cd '/projects/app' && npm test\n");
    });

    it('should return 404 if devfileCommandId not found', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: 'nonexistent' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();

      expect(body).toMatchObject({
        error: 'Devfile command not found: nonexistent',
      });
    });

    it('should use "task" prefix when no group specified', async () => {
      vi.spyOn(devfileCommandsModule, 'loadDevfileCommands').mockReturnValueOnce([
        {
          id: 'custom-cmd',
          label: 'Custom Command',
          component: 'test-container',
          commandLine: 'echo hello',
        },
      ]);

      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: 'custom-cmd' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.title).toBe('task: Custom Command');
    });
  });

  describe('POST /api/sessions with container parameter', () => {
    it('should pass container to createSession for regular session', async () => {
      const createSpy = vi.spyOn(manager, 'createSession');
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: 'sidecar-tools' }),
      });
      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith({ container: 'sidecar-tools' });
    });

    it('should pass component as container for devfile command', async () => {
      vi.spyOn(devfileCommandsModule, 'loadDevfileCommands').mockReturnValue([
        {
          id: 'build-app',
          label: 'Build Application',
          component: 'test-container',
          commandLine: 'npm run build',
          group: 'build',
        },
      ]);

      const createSpy = vi.spyOn(manager, 'createSession');
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: 'build-app' }),
      });
      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith({ container: 'test-container' });
    });

    it('should call createSession without options when no container specified', async () => {
      const createSpy = vi.spyOn(manager, 'createSession');
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(undefined);
    });
  });
});
