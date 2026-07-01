import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { WorkspaceStore } from './workspace-store.js';
import type { ChemuxerClient } from './chemuxer-client.js';
import type { EndpointResolver } from './endpoint-resolver.js';
import { registerListWorkspaces } from './tools/list-workspaces.js';
import { registerListTerminals } from './tools/list-terminals.js';
import { registerCreateTerminal } from './tools/create-terminal.js';
import { registerCloseTerminal } from './tools/close-terminal.js';
import { registerGetTerminalOutput } from './tools/get-terminal-output.js';
import { registerSendTerminalInput } from './tools/send-terminal-input.js';
import { registerGetActivityFeed } from './tools/get-activity-feed.js';
import { registerListDevfileCommands } from './tools/list-devfile-commands.js';
import { registerRunDevfileCommand } from './tools/run-devfile-command.js';

export function createMcpServer(store: WorkspaceStore, client: ChemuxerClient, resolver: EndpointResolver): McpServer {
  const server = new McpServer({ name: 'chemuxer-mcp', version: '0.1.0' });
  registerListWorkspaces(server, store, resolver);
  registerListTerminals(server, store, client, resolver);
  registerCreateTerminal(server, store, client, resolver);
  registerCloseTerminal(server, store, client, resolver);
  registerGetTerminalOutput(server, store, client, resolver);
  registerSendTerminalInput(server, store, client, resolver);
  registerGetActivityFeed(server, store, client, resolver);
  registerListDevfileCommands(server, store, client, resolver);
  registerRunDevfileCommand(server, store, client, resolver);
  return server;
}

export interface AppDeps {
  store: WorkspaceStore;
  client: ChemuxerClient;
  resolver: EndpointResolver;
}

export interface AppHandle {
  httpServer: http.Server;
  start(port: number, host: string): Promise<void>;
  shutdown(): Promise<void>;
}

const transports = new Map<string, StreamableHTTPServerTransport>();

function normalizeToolCallArguments(body: unknown): void {
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    if (
      msg &&
      typeof msg === 'object' &&
      'method' in msg &&
      (msg as Record<string, unknown>).method === 'tools/call' &&
      'params' in msg &&
      (msg as Record<string, unknown>).params &&
      ((msg as Record<string, unknown>).params as Record<string, unknown>).arguments === null
    ) {
      ((msg as Record<string, unknown>).params as Record<string, unknown>).arguments = {};
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function createApp(deps: AppDeps): AppHandle {
  const { store, client, resolver } = deps;
  let shuttingDown = false;

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/healthz' && req.method === 'GET') {
      const synced = store.synced;
      res.writeHead(synced ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: synced ? 'ok' : 'starting', synced }));
      return;
    }

    if (url.pathname === '/readyz' && req.method === 'GET') {
      const synced = store.synced;
      res.writeHead(synced ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: synced }));
      return;
    }

    if (url.pathname === '/mcp') {
      if (shuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Server is shutting down' }, id: null }));
        return;
      }

      if (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE') {
        await handleMcpRequest(req, res, deps);
      } else {
        res.writeHead(405).end('Method Not Allowed');
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  async function start(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => resolve());
    });
  }

  async function shutdown(): Promise<void> {
    shuttingDown = true;

    for (const [sid, transport] of transports) {
      await transport.close();
      transports.delete(sid);
    }

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    await store.stop();
  }

  return { httpServer, start, shutdown };
}

async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: AppDeps,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  let parsedBody: unknown;
  if (req.method === 'POST') {
    const body = await readBody(req);
    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
      return;
    }
    normalizeToolCallArguments(parsedBody);
  }

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  if (req.method === 'POST') {
    if (!sessionId && isInitializeRequest(parsedBody)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      const { store, client, resolver } = deps;
      const mcpServer = createMcpServer(store, client, resolver);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }
  }

  if (sessionId) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Session not found. Please re-initialize.' }, id: null }));
    return;
  }

  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null }));
}
