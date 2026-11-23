import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import { SessionManager } from '../session-manager.js';
import { setupWebSocketServer } from '../ws-handler.js';
import { DEFAULT_SETTINGS } from '@chemuxer/shared';
import type { ServerControlMessage } from '@chemuxer/shared';

function waitForMessage(ws: WebSocket): Promise<ServerControlMessage> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function connectWs(server: http.Server, path: string): Promise<WebSocket> {
  const addr = server.address() as { port: number };
  const ws = new WebSocket(`ws://localhost:${addr.port}${path}`);
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function connectControl(server: http.Server): Promise<{ ws: WebSocket; initial: ServerControlMessage }> {
  const addr = server.address() as { port: number };
  const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);
  const initialPromise = waitForMessage(ws);
  return new Promise((resolve, reject) => {
    ws.on('open', async () => {
      const initial = await initialPromise;
      resolve({ ws, initial });
    });
    ws.on('error', reject);
  });
}

function mockDiscovery() {
  return {
    getDefaultContainerName: () => 'default-container',
    getNamespace: () => 'test-namespace',
    getPodName: () => 'test-pod',
    getContainers: async () => [],
  } as any;
}

describe('WebSocket Handler', { timeout: 30000 }, () => {
  let server: http.Server;
  let manager: SessionManager;

  beforeEach(async () => {
    const mockSettingsManager = {
      getSettings: () => DEFAULT_SETTINGS,
      onChange: () => {},
      dispose: () => {},
      getSchemaString: () => '{}',
      writeSettings: () => DEFAULT_SETTINGS,
      writeSettingsRaw: () => DEFAULT_SETTINGS,
    };
    manager = new SessionManager(mockSettingsManager as any, mockDiscovery());
    const app = express();
    server = http.createServer(app);
    const { broadcastControl } = setupWebSocketServer(server, manager, mockSettingsManager as any);
    manager.setBroadcastControl(broadcastControl);
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });

  afterEach(async () => {
    manager.closeAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 1000);
    });
  });

  it('control: sends empty sessions list on connect', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msgPromise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const msg = await msgPromise;
    expect(msg.type).toBe('sessions');
    expect((msg as any).sessions).toEqual([]);
    ws.close();
  });

  it('control: create spawns a session and responds', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msg1Promise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    await msg1Promise; // consume initial sessions list

    ws.send(JSON.stringify({ type: 'create' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('session-created');
    expect((msg as any).session.id).toBeTruthy();
    expect((msg as any).session.shell).toBeTruthy();
    ws.close();
  });

  it('control: close removes a session and responds', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msg1Promise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    await msg1Promise; // consume initial sessions list

    ws.send(JSON.stringify({ type: 'create' }));
    const created = await waitForMessage(ws);
    const sessionId = (created as any).session.id;

    ws.send(JSON.stringify({ type: 'close', sessionId }));
    const closed = await waitForMessage(ws);
    expect(closed.type).toBe('session-closed');
    expect((closed as any).sessionId).toBe(sessionId);
    ws.close();
  });

  it('control: rename updates session title and broadcasts', async () => {
    const session = manager.createSession();
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msg1Promise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    await msg1Promise; // consume sessions list

    ws.send(JSON.stringify({ type: 'rename', sessionId: session.id, title: 'dev server' }));
    const renamed = await waitForMessage(ws);
    expect(renamed.type).toBe('session-renamed');
    expect((renamed as any).sessionId).toBe(session.id);
    expect((renamed as any).title).toBe('dev server');
    ws.close();
  });

  it('control: rename with empty title reverts to default', async () => {
    const session = manager.createSession();
    const defaultTitle = session.title;
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msg1Promise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    await msg1Promise;

    ws.send(JSON.stringify({ type: 'rename', sessionId: session.id, title: 'custom' }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: 'rename', sessionId: session.id, title: '' }));
    const renamed = await waitForMessage(ws);
    expect((renamed as any).title).toBe(defaultTitle);
    ws.close();
  });

  it('control: rename broadcasts to other control clients', async () => {
    const session = manager.createSession();
    const addr = server.address() as { port: number };

    const ws1 = new WebSocket(`ws://localhost:${addr.port}/ws/control`);
    const ws1InitPromise = waitForMessage(ws1);
    await new Promise<void>((resolve, reject) => {
      ws1.on('open', () => resolve());
      ws1.on('error', reject);
    });
    await ws1InitPromise;

    const ws2 = new WebSocket(`ws://localhost:${addr.port}/ws/control`);
    const ws2InitPromise = waitForMessage(ws2);
    await new Promise<void>((resolve, reject) => {
      ws2.on('open', () => resolve());
      ws2.on('error', reject);
    });
    await ws2InitPromise;

    const ws2MsgPromise = waitForMessage(ws2);
    ws1.send(JSON.stringify({ type: 'rename', sessionId: session.id, title: 'renamed' }));

    const [ws1Msg, ws2Msg] = await Promise.all([waitForMessage(ws1), ws2MsgPromise]);
    expect(ws1Msg.type).toBe('session-renamed');
    expect(ws2Msg.type).toBe('session-renamed');
    expect((ws2Msg as any).title).toBe('renamed');

    ws1.close();
    ws2.close();
  });

  it('control: sends sessions list with existing sessions on connect', async () => {
    const session = manager.createSession();

    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/control`);

    const msgPromise = waitForMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const msg = await msgPromise;
    expect(msg.type).toBe('sessions');
    expect((msg as any).sessions).toHaveLength(1);
    expect((msg as any).sessions[0].id).toBe(session.id);
    ws.close();
  });

  it('io: data from client is written to PTY', async () => {
    const session = manager.createSession();
    const ws = await connectWs(server, `/ws/${session.id}`);

    await new Promise((r) => setTimeout(r, 200));

    ws.send(Buffer.from('echo hello\r'));

    const output = await new Promise<string>((resolve) => {
      let buf = '';
      ws.on('message', (data) => {
        buf += data.toString();
        if (buf.includes('hello')) {
          resolve(buf);
        }
      });
    });

    expect(output).toContain('hello');
    ws.close();
  });

  it('io: resize message propagates to session', async () => {
    const session = manager.createSession();
    const ws = await connectWs(server, `/ws/${session.id}`);

    ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));

    await new Promise((r) => setTimeout(r, 100));
    ws.close();
  });

  it('control: malformed JSON does not crash server', async () => {
    const { ws } = await connectControl(server);

    ws.send('not valid json{{{');
    await new Promise((r) => setTimeout(r, 200));

    // Connection should still be open
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('io: malformed JSON does not crash handler', async () => {
    const session = manager.createSession();
    const ws = await connectWs(server, `/ws/${session.id}`);
    await new Promise((r) => setTimeout(r, 100));

    ws.send('not valid json{{{');

    // Connection should still be alive — send valid binary data after
    ws.send(Buffer.from('echo hi\r'));
    const output = await new Promise<string>((resolve) => {
      let buf = '';
      ws.on('message', (data) => {
        buf += data.toString();
        if (buf.includes('hi')) resolve(buf);
      });
    });
    expect(output).toContain('hi');
    ws.close();
  });

  it('io: returns 4404 close code for unknown session ID', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws/nonexistent`);

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(code).toBe(4404);
  });

  // --- Pin support ---
  it('control: pin message sets session pinned state', async () => {
    const session = manager.createSession();
    const { ws } = await connectControl(server);

    ws.send(JSON.stringify({ type: 'pin', sessionId: session.id, pinned: true }));
    const pinned = await waitForMessage(ws);
    expect(pinned.type).toBe('session-pinned');
    expect((pinned as any).sessionId).toBe(session.id);
    expect((pinned as any).pinned).toBe(true);

    // Verify the session is actually pinned
    expect(session.toInfo().pinned).toBe(true);
    ws.close();
  });

  it('control: pin message broadcasts to other control clients', async () => {
    const session = manager.createSession();
    const addr = server.address() as { port: number };

    const ws1 = new WebSocket(`ws://localhost:${addr.port}/ws/control`);
    const ws1InitPromise = waitForMessage(ws1);
    await new Promise<void>((resolve, reject) => {
      ws1.on('open', () => resolve());
      ws1.on('error', reject);
    });
    await ws1InitPromise;

    const ws2 = new WebSocket(`ws://localhost:${addr.port}/ws/control`);
    const ws2InitPromise = waitForMessage(ws2);
    await new Promise<void>((resolve, reject) => {
      ws2.on('open', () => resolve());
      ws2.on('error', reject);
    });
    await ws2InitPromise;

    const ws2MsgPromise = waitForMessage(ws2);
    ws1.send(JSON.stringify({ type: 'pin', sessionId: session.id, pinned: true }));

    const [ws1Msg, ws2Msg] = await Promise.all([waitForMessage(ws1), ws2MsgPromise]);
    expect(ws1Msg.type).toBe('session-pinned');
    expect(ws2Msg.type).toBe('session-pinned');
    expect((ws2Msg as any).pinned).toBe(true);

    ws1.close();
    ws2.close();
  });

  it('control: close returns error for pinned session', async () => {
    const session = manager.createSession();
    manager.pinSession(session.id, true);

    const { ws } = await connectControl(server);

    ws.send(JSON.stringify({ type: 'close', sessionId: session.id }));
    const error = await waitForMessage(ws);
    expect(error.type).toBe('error');
    expect((error as any).code).toBe('SESSION_PINNED');
    expect((error as any).sessionId).toBe(session.id);

    // Verify session still exists
    expect(manager.getSession(session.id)).toBeTruthy();
    ws.close();
  });

  it('control: passes container field from create message to session manager', async () => {
    const { ws } = await connectControl(server);
    const createSpy = vi.spyOn(manager, 'createSession');

    ws.send(JSON.stringify({ type: 'create', container: 'sidecar-tools' }));
    await waitForMessage(ws); // wait for session-created

    expect(createSpy).toHaveBeenCalledWith({ container: 'sidecar-tools' });
    ws.close();
  });
});
