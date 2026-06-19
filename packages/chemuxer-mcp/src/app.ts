import express from 'express';
import { createServer, type Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { WorkspaceStore } from './workspace-store.js';
import type { ChemuxerClient } from './chemuxer-client.js';
import { createHealthRouter } from './health.js';
import { registerListWorkspaces } from './tools/list-workspaces.js';
import { registerListTerminals } from './tools/list-terminals.js';
import { registerCreateTerminal } from './tools/create-terminal.js';
import { registerCloseTerminal } from './tools/close-terminal.js';
import { registerGetTerminalOutput } from './tools/get-terminal-output.js';
import { registerSendTerminalInput } from './tools/send-terminal-input.js';
import { registerGetActivityFeed } from './tools/get-activity-feed.js';

function createMcpServer(store: WorkspaceStore, client: ChemuxerClient): McpServer {
  const server = new McpServer({ name: 'chemuxer-mcp', version: '0.1.0' });
  registerListWorkspaces(server, store);
  registerListTerminals(server, store, client);
  registerCreateTerminal(server, store, client);
  registerCloseTerminal(server, store, client);
  registerGetTerminalOutput(server, store, client);
  registerSendTerminalInput(server, store, client);
  registerGetActivityFeed(server, store, client);
  return server;
}

export interface AppDeps {
  store: WorkspaceStore;
  client: ChemuxerClient;
}

export interface AppHandle {
  app: express.Express;
  httpServer: Server;
  start(port: number, host: string): Promise<void>;
  shutdown(): Promise<void>;
}

export function createApp(deps: AppDeps): AppHandle {
  const { store, client } = deps;
  const app = express();
  const httpServer = createServer(app);

  app.use(createHealthRouter(store));

  const sessions = new Map<string, { transport: SSEServerTransport; mcpServer: McpServer }>();
  let shuttingDown = false;

  app.get('/sse', async (req, res) => {
    if (shuttingDown) {
      res.status(503).json({ error: 'Server is shutting down' });
      return;
    }

    let transport: SSEServerTransport | undefined;
    let mcpServer: McpServer | undefined;
    try {
      transport = new SSEServerTransport('/messages', res);
      mcpServer = createMcpServer(store, client);
      await mcpServer.connect(transport);
      sessions.set(transport.sessionId, { transport, mcpServer });

      res.on('close', async () => {
        const session = sessions.get(transport!.sessionId);
        if (session) {
          try { await session.mcpServer.close(); } catch { /* ignore */ }
        }
        sessions.delete(transport!.sessionId);
      });
    } catch (err) {
      console.error('[app] SSE connection error:', err);
      if (mcpServer) {
        try { await mcpServer.close(); } catch { /* ignore */ }
      }
      if (transport) {
        try { await transport.close(); } catch { /* ignore */ }
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish SSE connection' });
      }
    }
  });

  app.post('/messages', express.json({ limit: '1mb' }), async (req, res) => {
    if (shuttingDown) {
      res.status(503).json({ error: 'Server is shutting down' });
      return;
    }

    const sessionId = req.query.sessionId as string | undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await session.transport.handlePostMessage(req, res);
  });

  async function start(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => resolve());
    });
  }

  async function shutdown(): Promise<void> {
    shuttingDown = true;

    // Close all active MCP servers and transports
    const closeTasks = Array.from(sessions.values()).flatMap((s) => [
      s.mcpServer.close(),
      s.transport.close(),
    ]);
    await Promise.allSettled(closeTasks);
    sessions.clear();

    // Now stop accepting new connections (completes immediately since SSE responses are closed)
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    // Stop the workspace store
    await store.stop();
  }

  return { app, httpServer, start, shutdown };
}
