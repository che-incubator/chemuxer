import { useState, useEffect, useCallback, useRef } from 'react';
import { useReconnectingWebSocket } from './useReconnectingWebSocket.js';
import type { SessionInfo, ServerControlMessage } from '../../../shared/protocol.js';

export interface ControlState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string) => void;
  createSession: () => void;
  closeSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  connected: boolean;
  retryIn: number | null;
}

interface ControlOptions {
  onSettingsChanged?: (settings: import('../../../shared/settings.js').Settings) => void;
}

export function useControl(url: string, options?: ControlOptions): ControlState {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const onSettingsChangedRef = useRef(options?.onSettingsChanged);
  onSettingsChangedRef.current = options?.onSettingsChanged;

  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: ServerControlMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('[useControl] malformed message:', event.data);
      return;
    }

    if (msg.type === 'sessions') {
      setSessions(msg.sessions);
      if (msg.sessions.length > 0) {
        setActiveSessionId((prev) => prev ?? msg.sessions[0].id);
      }
    } else if (msg.type === 'session-created') {
      setSessions((prev) => [...prev, msg.session]);
      setActiveSessionId(msg.session.id);
    } else if (msg.type === 'session-closed') {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== msg.sessionId);
        setActiveSessionId((currentActive) => {
          if (currentActive === msg.sessionId) {
            return next.length > 0 ? next[next.length - 1].id : null;
          }
          return currentActive;
        });
        return next;
      });
    } else if (msg.type === 'session-renamed') {
      setSessions((prev) =>
        prev.map((s) => s.id === msg.sessionId ? { ...s, title: msg.title, renamed: msg.renamed } : s)
      );
    } else if (msg.type === 'settings-changed') {
      onSettingsChangedRef.current?.(msg.settings);
    }
  }, []);

  const { ws, connected, retryIn } = useReconnectingWebSocket(url, { onMessage: handleMessage });

  const send = useCallback((msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [ws]);

  const createSession = useCallback(() => send({ type: 'create' }), [send]);
  const closeSession = useCallback((id: string) => send({ type: 'close', sessionId: id }), [send]);
  const renameSession = useCallback((id: string, title: string) => send({ type: 'rename', sessionId: id, title }), [send]);

  return { sessions, activeSessionId, setActiveSessionId, createSession, closeSession, renameSession, connected, retryIn };
}
