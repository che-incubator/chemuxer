import { Router } from 'express';
import type { SessionManager } from './session-manager.js';
import { SessionLimitError } from './session-manager.js';
import type { SettingsManager } from './settings-manager.js';
import type { FeedCollector } from './feed-collector.js';
import { stripAnsi } from './strip-ansi.js';
import type { ServerControlMessage } from '@chemuxer/shared';
import { loadDevfileCommands } from './devfile-commands.js';
import type { ContainerDiscovery } from './container-discovery.js';

const AGENTS_MD = `# Chemuxer — Agent Instructions

Chemuxer is a web-based terminal multiplexer running inside Eclipse Che
workspaces. There are two ways to interact with it programmatically,
depending on where your agent is running.

## External agents (recommended)

If your agent runs outside the cluster (e.g., Claude Code on your laptop),
use the **namespace-level MCP server**. It aggregates terminal sessions
across ALL workspaces in your namespace through a single connection.

1. Port-forward the MCP service:

  kubectl port-forward svc/chemuxer-mcp 3001:3001 -n <your-namespace>

2. Configure your MCP client (e.g., ~/.claude/settings.json):

  {
    "mcpServers": {
      "chemuxer": {
        "type": "sse",
        "url": "http://localhost:3001/sse"
      }
    }
  }

Available MCP tools: list_workspaces, list_terminals, get_terminal_output,
send_terminal_input, create_terminal, close_terminal, get_activity_feed.

All tools except list_workspaces accept a "workspace" parameter to target a
specific workspace. get_activity_feed can omit "workspace" for a cross-workspace
activity view. list_workspaces takes no parameters.

See: https://github.com/che-incubator/chemuxer/tree/main/packages/chemuxer-mcp

## In-workspace agents

If your agent runs inside the same workspace pod, use the REST API directly
at http://localhost:7681. No authentication is needed.

### Sessions

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

### Terminal I/O

Read the current terminal buffer (plain text, no ANSI codes):
  GET /api/sessions/{id}/buffer
  Response: { "content": "..." }

Send input to a session (include \\\\r for Enter):
  POST /api/sessions/{id}/input
  Body: { "data": "ls -la\\\\r" }

### Activity Feed

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
  settingsManager: SettingsManager,
  feedCollector: FeedCollector,
  broadcastControl: (data: ServerControlMessage) => void,
  discovery: ContainerDiscovery,
): Router {
  const router = Router();

  // --- Settings ---
  router.get('/api/settings', (_req, res) => {
    res.json(settingsManager.getSettings());
  });

  router.put('/api/settings', (req, res) => {
    try {
      const updated = settingsManager.writeSettings(req.body);
      res.json(updated);
    } catch (err) {
      console.error('[settings] PUT failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/settings/schema', (_req, res) => {
    res.type('application/json').send(settingsManager.getSchemaString());
  });

  // --- agents.md ---
  router.get(['/agents.md', '/.well-known/agents.md'], (_req, res) => {
    res.type('text/markdown').send(AGENTS_MD);
  });

  // Resolve :id param for all /api/sessions/:id routes
  router.param('id', (req, res, next, id) => {
    const session = manager.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found', status: 404 });
      return;
    }
    req.session! = session;
    next();
  });

  // --- Session CRUD ---
  router.get('/api/sessions', (_req, res) => {
    res.json(manager.listSessions());
  });

  router.post('/api/sessions', (req, res, next) => {
    const { pinned, devfileCommandId } = req.body || {};

    // Handle devfile command execution
    if (devfileCommandId) {
      try {
        const devfileCommands = loadDevfileCommands();
        const command = devfileCommands.find(cmd => cmd.id === devfileCommandId);

        if (!command) {
          return res.status(404).json({
            error: `Devfile command not found: ${devfileCommandId}`,
          });
        }

        // Create session
        const session = manager.createSession();

        // Generate title: group: label or task: label
        const prefix = command.group || 'task';
        const displayName = command.label || command.id;
        const title = `${prefix}: ${displayName}`;
        session.rename(title);

        // Build command text with workingDir if present
        let commandText: string;
        if (command.workingDir) {
          // Quote workingDir for shell safety (same pattern as chemuxer-mcp)
          const quotedDir = command.workingDir.replace(/'/g, "'\\''");
          commandText = `cd '${quotedDir}' && ${command.commandLine}\n`;
        } else {
          commandText = `${command.commandLine}\n`;
        }

        // Execute command in session
        session.write(commandText);

        // Handle pinning
        if (pinned === true) {
          manager.pinSession(session.id, true);
        }

        return res.status(201).json(session.toInfo());
      } catch (err) {
        if (err instanceof SessionLimitError) {
          return res.status(429).json({ error: 'Maximum session limit reached' });
        }
        return next(err);
      }
    }

    // Regular session creation (existing code path)
    let session;
    try {
      session = manager.createSession();
    } catch (err) {
      if (err instanceof SessionLimitError) {
        res.status(429).json({ error: 'Maximum session limit reached' });
        return;
      }
      next(err);
      return;
    }
    if (pinned === true) {
      manager.pinSession(session.id, true);
    }
    res.status(201).json(session.toInfo());
  });

  router.get('/api/sessions/:id', (req, res) => {
    res.json(req.session!.toInfo());
  });

  router.delete('/api/sessions/:id', (req, res) => {
    const force = req.query.force === 'true';
    const result = manager.closeSession(req.params.id, force);

    if (result === 'pinned') {
      res.status(409).json({
        error: 'Session is pinned',
        code: 'SESSION_PINNED',
        sessionId: req.params.id,
      });
      return;
    }

    broadcastControl({ type: 'session-closed', sessionId: req.params.id, exitCode: null });
    res.json({ ok: true });
  });

  router.patch('/api/sessions/:id', (req, res) => {
    const { title, pinned } = req.body;

    if (title === undefined && pinned === undefined) {
      res.status(400).json({ error: 'Request must include title or pinned', status: 400 });
      return;
    }

    if (title !== undefined) {
      if (typeof title !== 'string') {
        res.status(400).json({ error: 'title must be a string', status: 400 });
        return;
      }
      req.session!.rename(title);
      const info = req.session!.toInfo();
      broadcastControl({ type: 'session-renamed', sessionId: info.id, title: info.title, renamed: info.renamed });
    }

    if (pinned !== undefined) {
      if (typeof pinned !== 'boolean') {
        res.status(400).json({ error: 'pinned must be a boolean', status: 400 });
        return;
      }
      manager.pinSession(req.params.id, pinned);
      broadcastControl({ type: 'session-pinned', sessionId: req.params.id, pinned });
    }

    res.json(req.session!.toInfo());
  });

  // --- Terminal I/O ---
  router.get('/api/sessions/:id/buffer', (req, res) => {
    const content = stripAnsi(req.session!.getState());
    res.json({ content });
  });

  router.post('/api/sessions/:id/input', (req, res) => {
    const { data } = req.body;
    if (typeof data !== 'string') {
      res.status(400).json({ error: 'data must be a string', status: 400 });
      return;
    }
    req.session!.write(data);
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

  // --- Devfile commands ---
  router.get('/api/devfile-commands', (_req, res) => {
    res.json(loadDevfileCommands());
  });

  // --- Containers ---
  router.get('/api/containers', async (_req, res) => {
    const containers = await discovery.getContainers();
    res.json(containers);
  });

  return router;
}
