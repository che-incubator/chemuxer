import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionManager, SessionLimitError } from './session-manager.js';
import { SettingsManager } from './settings-manager.js';
import type {
  ClientControlMessage,
  ClientIOMessage,
  ServerControlMessage,
} from '@chemuxer/shared';
import {
  isClientControlMessage,
  isClientIOMessage,
} from '@chemuxer/shared';

export function setupWebSocketServer(
  server: http.Server,
  manager: SessionManager,
  settingsManager: SettingsManager
): { broadcastControl: (data: ServerControlMessage) => void } {
  const WS_CONTROL_PATH = '/ws/control';
  const WS_IO_PREFIX = '/ws/';
  const MAX_CONNECTIONS = 100;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });
  let activeConnections = 0;
  const controlClients = new Set<WebSocket>();

  settingsManager.onChange((settings) => {
    broadcastControl({ type: 'settings-changed', settings });
  });

  server.on('upgrade', (req, socket, head) => {
    // Origin validation: block cross-origin browser requests (CSWSH protection)
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host || '';
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const isLocalhost = (h: string) => {
        const hostname = h.split(':')[0];
        return hostname === 'localhost' || hostname === '127.0.0.1';
      };
      if (originHost !== host && !isLocalhost(originHost)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    if (activeConnections >= MAX_CONNECTIONS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === WS_CONTROL_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        activeConnections++;
        ws.on('close', () => { activeConnections--; });
        wss.emit('connection', ws, req);
        handleControl(ws, manager, controlClients);
      });
    } else if (pathname.startsWith(WS_IO_PREFIX)) {
      const sessionId = pathname.slice(WS_IO_PREFIX.length);
      const session = manager.getSession(sessionId);
      if (!session) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          activeConnections++;
          ws.on('close', () => { activeConnections--; });
          wss.emit('connection', ws, req);
          ws.close(4404, 'Session not found');
        });
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        activeConnections++;
        ws.on('close', () => { activeConnections--; });
        wss.emit('connection', ws, req);
        handleIO(ws, session);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcastControl(data: ServerControlMessage): void {
    const msg = JSON.stringify(data);
    for (const client of controlClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  function handleControl(
    ws: WebSocket,
    mgr: SessionManager,
    clients: Set<WebSocket>
  ): void {
    clients.add(ws);

    ws.send(JSON.stringify({ type: 'sessions', sessions: mgr.listSessions() }));

    ws.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!isClientControlMessage(parsed)) {
        console.warn('[ws] invalid control message:', parsed);
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid control message' }));
        return;
      }

      const msg: ClientControlMessage = parsed;

      if (msg.type === 'create') {
        try {
          mgr.createSession();
        } catch (err) {
          if (err instanceof SessionLimitError) {
            ws.send(JSON.stringify({ type: 'error', error: 'Maximum session limit reached' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', error: 'Unable to create session' }));
          }
          return;
        }
      } else if (msg.type === 'close') {
        const result = mgr.closeSession(msg.sessionId);
        if (result === 'pinned') {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Session is pinned',
            code: 'SESSION_PINNED',
            sessionId: msg.sessionId,
          }));
        } else if (result === 'closed') {
          broadcastControl({ type: 'session-closed', sessionId: msg.sessionId, exitCode: null });
        }
      } else if (msg.type === 'rename') {
        const session = mgr.getSession(msg.sessionId);
        if (session) {
          session.rename(msg.title);
          broadcastControl({ type: 'session-renamed', sessionId: msg.sessionId, title: session.title, renamed: session.toInfo().renamed });
        }
      } else if (msg.type === 'pin') {
        const session = mgr.getSession(msg.sessionId);
        if (session) {
          mgr.pinSession(msg.sessionId, msg.pinned);
          broadcastControl({ type: 'session-pinned', sessionId: msg.sessionId, pinned: msg.pinned });
        } else {
          ws.send(JSON.stringify({ type: 'error', error: `Session "${msg.sessionId}" not found` }));
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  }

  function handleIO(ws: WebSocket, session: import('./session.js').Session): void {
    // Replay scrollback
    const state = session.getState();
    if (state.length > 0) {
      ws.send(Buffer.from(state));
    }

    // Forward PTY output to this client
    const onData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(data));
      }
    };
    const disposeDataListener = session.onData(onData);

    // Close IO WebSocket when PTY process exits
    session.onExit(() => {
      disposeDataListener();
      ws.close(4000, 'session-exited');
    });

    // Forward client input to PTY
    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        session.write(raw.toString());
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!isClientIOMessage(parsed)) {
          console.warn('[ws] invalid IO message:', parsed);
          return;
        }
        const msg: ClientIOMessage = parsed;
        if (msg.type === 'resize') {
          session.resize(msg.cols, msg.rows);
        }
      }
    });

    ws.on('close', () => {
      disposeDataListener();
    });
  }

  return { broadcastControl };
}
