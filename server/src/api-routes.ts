import { Router } from 'express';
import type { SessionManager } from './session-manager.js';
import type { FeedCollector } from './feed-collector.js';
import { stripAnsi } from './strip-ansi.js';

const AGENTS_MD = `# Chemuxer — Agent Instructions

Chemuxer is a web-based terminal multiplexer running inside this workspace.
You can manage terminal sessions and read their output via the REST API below.

## Sessions

List all sessions:
  GET /api/sessions

Create a new session:
  POST /api/sessions

Get a session by ID:
  GET /api/sessions/{id}

Close a session:
  DELETE /api/sessions/{id}

Rename a session:
  PATCH /api/sessions/{id}
  Body: { "title": "new name" }

## Terminal I/O

Read the current terminal buffer (plain text, no ANSI codes):
  GET /api/sessions/{id}/buffer
  Response: { "content": "..." }

Send input to a session (include \\\\r for Enter):
  POST /api/sessions/{id}/input
  Body: { "data": "ls -la\\\\r" }

## Activity Feed

The feed provides periodic text snapshots of terminal output.
Use it to catch up on recent activity without maintaining a connection.

Get recent activity across all sessions:
  GET /api/feed?since={ISO 8601 timestamp}

Get recent activity for one session:
  GET /api/sessions/{id}/feed?since={ISO 8601 timestamp}

Response:
  {
    "entries": [{ "timestamp": "...", "sessionId": "...", "content": "..." }],
    "nextSince": "..."
  }

Pass the "nextSince" value as the "since" parameter on your next request
for seamless pagination. Omit "since" to get the latest snapshot only.
`;

export function createApiRouter(
  manager: SessionManager,
  feedCollector: FeedCollector,
  broadcastControl: (data: object) => void,
): Router {
  const router = Router();

  // --- agents.md ---
  router.get(['/agents.md', '/.well-known/agents.md'], (_req, res) => {
    res.type('text/markdown').send(AGENTS_MD);
  });

  // --- Session CRUD ---
  router.get('/api/sessions', (_req, res) => {
    res.json(manager.listSessions());
  });

  router.post('/api/sessions', (_req, res) => {
    const session = manager.createSession();
    session.onExit((exitCode) => {
      manager.closeSession(session.id);
      broadcastControl({ type: 'session-closed', sessionId: session.id, exitCode });
    });
    broadcastControl({ type: 'session-created', session: session.toInfo() });
    res.status(201).json(session.toInfo());
  });

  router.get('/api/sessions/:id', (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    res.json(session.toInfo());
  });

  router.delete('/api/sessions/:id', (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    manager.closeSession(req.params.id);
    broadcastControl({ type: 'session-closed', sessionId: req.params.id, exitCode: null });
    res.json({ ok: true });
  });

  router.patch('/api/sessions/:id', (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    const { title } = req.body;
    if (typeof title !== 'string') {
      res.status(400).json({ error: 'title must be a string', status: 400 });
      return;
    }
    session.rename(title);
    const info = session.toInfo();
    broadcastControl({ type: 'session-renamed', sessionId: info.id, title: info.title, renamed: info.renamed });
    res.json(info);
  });

  // --- Terminal I/O ---
  router.get('/api/sessions/:id/buffer', (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    const content = stripAnsi(session.getState());
    res.json({ content });
  });

  router.post('/api/sessions/:id/input', (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    const { data } = req.body;
    if (typeof data !== 'string') {
      res.status(400).json({ error: 'data must be a string', status: 400 });
      return;
    }
    session.write(data);
    res.json({ ok: true });
  });

  // --- Feed ---
  router.get('/api/sessions/:id/feed', (req, res) => {
    const since = req.query.since as string | undefined;
    res.json(feedCollector.getSessionFeed(req.params.id, since));
  });

  router.get('/api/feed', (req, res) => {
    const since = req.query.since as string | undefined;
    res.json(feedCollector.getAllFeed(since));
  });

  return router;
}
