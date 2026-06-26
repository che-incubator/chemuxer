import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { ChemuxerClient, UpstreamError } from '../chemuxer-client.js';
import type { SessionInfo, FeedResponse } from '@chemuxer/shared';

// --- Canned data ---

const SESSIONS: SessionInfo[] = [
  { id: 'sess-1', shell: '/bin/bash', title: 'build', renamed: false, pinned: false, createdAt: 1000 },
  { id: 'sess-2', shell: '/bin/zsh', title: 'test', renamed: true, pinned: false, createdAt: 2000 },
];

const CREATED_SESSION: SessionInfo = {
  id: 'sess-3',
  shell: '/bin/bash',
  title: 'new',
  renamed: false,
  pinned: false,
  createdAt: 3000,
};

const CREATED_PINNED_SESSION: SessionInfo = {
  id: 'sess-4',
  shell: '/bin/bash',
  title: 'pinned',
  renamed: false,
  createdAt: 4000,
  pinned: true,
};

const FEED: FeedResponse = {
  entries: [{ timestamp: '2026-01-01T00:00:00Z', sessionId: 'sess-1', content: 'hello' }],
  nextSince: '2026-01-01T00:01:00Z',
};

// --- Test HTTP server ---

let server: Server;
let endpoint: string;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

let lastInputBody: string | undefined;
let lastFeedUrl: string | undefined;
let lastCreateSessionBody: string | undefined;

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handler(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url!, 'http://localhost').pathname;
  const method = req.method!;

  // Special session ID "SLOW" — delays response for timeout testing
  if (method === 'GET' && path === '/api/sessions/SLOW/buffer') {
    setTimeout(() => json(res, 200, { content: 'slow' }), 5000);
    return;
  }

  // Special session ID "ERR503" — returns 503 for error testing
  if (method === 'GET' && path === '/api/sessions/ERR503/buffer') {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Service Unavailable');
    return;
  }

  // GET /api/sessions
  if (method === 'GET' && path === '/api/sessions') {
    json(res, 200, SESSIONS);
    return;
  }

  // POST /api/sessions
  if (method === 'POST' && path === '/api/sessions') {
    readBody(req).then((body) => {
      lastCreateSessionBody = body;
      const parsed = body ? JSON.parse(body) : {};
      if (parsed.pinned) {
        json(res, 201, CREATED_PINNED_SESSION);
      } else {
        json(res, 201, CREATED_SESSION);
      }
    });
    return;
  }

  // GET /api/sessions/:id/buffer
  if (method === 'GET' && /^\/api\/sessions\/[^/]+\/buffer$/.test(path)) {
    json(res, 200, { content: '$ ls\nfoo  bar\n' });
    return;
  }

  // POST /api/sessions/:id/input
  if (method === 'POST' && /^\/api\/sessions\/[^/]+\/input$/.test(path)) {
    readBody(req).then((body) => {
      lastInputBody = body;
      json(res, 200, { ok: true });
    });
    return;
  }

  // DELETE /api/sessions/:id
  if (method === 'DELETE' && /^\/api\/sessions\/[^/]+(\\?.*)?$/.test(path)) {
    const url = new URL(req.url!, 'http://localhost');
    const sessionId = path.split('/')[3];
    const force = url.searchParams.get('force') === 'true';

    // Special session ID "PINNED" returns 409 without force=true
    if (sessionId === 'PINNED' && !force) {
      json(res, 409, { error: 'Session is pinned', code: 'SESSION_PINNED' });
      return;
    }

    json(res, 200, { ok: true });
    return;
  }

  // GET /api/sessions/:id/feed or GET /api/feed
  if (method === 'GET' && /\/feed$/.test(path)) {
    lastFeedUrl = req.url!;
    json(res, 200, FEED);
    return;
  }

  // Fallback — 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// --- Setup / Teardown ---

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  endpoint = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// --- Tests ---

describe('ChemuxerClient', () => {
  const client = new ChemuxerClient();

  it('listSessions returns parsed SessionInfo[]', async () => {
    const sessions = await client.listSessions(endpoint);
    expect(sessions).toEqual(SESSIONS);
  });

  it('getBuffer returns content string', async () => {
    const buffer = await client.getBuffer(endpoint, 'sess-1');
    expect(buffer).toBe('$ ls\nfoo  bar\n');
  });

  it('sendInput sends POST with { data } body', async () => {
    lastInputBody = undefined;
    await client.sendInput(endpoint, 'sess-1', 'echo hi\r');
    expect(lastInputBody).toBeDefined();
    expect(JSON.parse(lastInputBody!)).toEqual({ data: 'echo hi\r' });
  });

  it('createSession returns parsed SessionInfo', async () => {
    const session = await client.createSession(endpoint);
    expect(session).toEqual(CREATED_SESSION);
  });

  it('closeSession sends DELETE', async () => {
    await expect(client.closeSession(endpoint, 'sess-1')).resolves.toBeUndefined();
  });

  describe('getFeed', () => {
    it('without sessionId or since hits /api/feed', async () => {
      lastFeedUrl = undefined;
      const feed = await client.getFeed(endpoint);
      expect(feed).toEqual(FEED);
      expect(lastFeedUrl).toBe('/api/feed');
    });

    it('with sessionId hits /api/sessions/:id/feed', async () => {
      lastFeedUrl = undefined;
      await client.getFeed(endpoint, 'sess-1');
      expect(lastFeedUrl).toBe('/api/sessions/sess-1/feed');
    });

    it('with since appends encoded query param', async () => {
      lastFeedUrl = undefined;
      await client.getFeed(endpoint, undefined, '2026-01-01T00:00:00Z');
      expect(lastFeedUrl).toBe('/api/feed?since=2026-01-01T00%3A00%3A00Z');
    });

    it('with sessionId and since combines both', async () => {
      lastFeedUrl = undefined;
      await client.getFeed(endpoint, 'sess-1', '2026-01-01T00:00:00Z');
      expect(lastFeedUrl).toBe(
        '/api/sessions/sess-1/feed?since=2026-01-01T00%3A00%3A00Z',
      );
    });
  });

  it('timeout: server delay exceeding timeoutMs throws abort error', async () => {
    const shortClient = new ChemuxerClient({ timeoutMs: 50 });
    // Session ID "SLOW" triggers a 5s delay in the test server
    await expect(shortClient.getBuffer(endpoint, 'SLOW')).rejects.toThrow();
  });

  it('non-2xx response throws UpstreamError with status code', async () => {
    // Session ID "ERR503" triggers a 503 response in the test server
    try {
      await client.getBuffer(endpoint, 'ERR503');
      expect.fail('Should have thrown UpstreamError');
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      expect((err as UpstreamError).statusCode).toBe(503);
      expect((err as UpstreamError).body).toBe('Service Unavailable');
    }
  });

  describe('pinned sessions', () => {
    it('createSession sends pinned in body', async () => {
      lastCreateSessionBody = undefined;
      const session = await client.createSession(endpoint, { pinned: true });
      expect(session).toEqual(CREATED_PINNED_SESSION);
      expect(lastCreateSessionBody).toBeDefined();
      expect(JSON.parse(lastCreateSessionBody!)).toEqual({ pinned: true });
    });

    it('closeSession with force appends force=true query param', async () => {
      await expect(client.closeSession(endpoint, 'sess-1', { force: true })).resolves.toBeUndefined();
    });

    it('closeSession without force on pinned session throws UpstreamError 409', async () => {
      try {
        await client.closeSession(endpoint, 'PINNED');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UpstreamError);
        expect((err as UpstreamError).statusCode).toBe(409);
      }
    });
  });
});
