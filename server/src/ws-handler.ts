import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionManager } from './session-manager.js';
import { SettingsManager } from './settings-manager.js';
import type { ClientControlMessage, ClientIOMessage } from '../../shared/protocol.js';

export function setupWebSocketServer(
  server: http.Server,
  manager: SessionManager,
  settingsManager: SettingsManager
): void {
  const wss = new WebSocketServer({ noServer: true });
  const controlClients = new Set<WebSocket>();

  settingsManager.onChange((settings) => {
    broadcastControl({ type: 'settings-changed', settings });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/ws/control') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
        handleControl(ws, manager, controlClients);
      });
    } else if (pathname.startsWith('/ws/')) {
      const sessionId = pathname.slice(4); // strip '/ws/'
      const session = manager.getSession(sessionId);
      if (!session) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
          ws.close(4404, 'Session not found');
        });
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
        handleIO(ws, session);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcastControl(data: object): void {
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
      let msg: ClientControlMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'create') {
        const session = mgr.createSession();
        session.onExit((exitCode) => {
          mgr.closeSession(session.id);
          broadcastControl({ type: 'session-closed', sessionId: session.id, exitCode });
        });
        broadcastControl({ type: 'session-created', session: session.toInfo() });
      } else if (msg.type === 'close') {
        mgr.closeSession(msg.sessionId);
        broadcastControl({ type: 'session-closed', sessionId: msg.sessionId, exitCode: null });
      } else if (msg.type === 'rename') {
        const session = mgr.getSession(msg.sessionId);
        if (session) {
          session.rename(msg.title);
          broadcastControl({ type: 'session-renamed', sessionId: msg.sessionId, title: session.title, renamed: session.toInfo().renamed });
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

    // Forward client input to PTY
    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        session.write(raw.toString());
      } else {
        let msg: ClientIOMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg.type === 'resize') {
          session.resize(msg.cols, msg.rows);
        }
      }
    });

    ws.on('close', () => {
      disposeDataListener();
    });
  }
}
