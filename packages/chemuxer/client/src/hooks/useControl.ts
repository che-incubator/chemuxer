import { useState, useCallback, useRef } from 'react';
import { useReconnectingWebSocket } from './useReconnectingWebSocket.js';
import type { SessionInfo, ServerControlMessage } from '@chemuxer/shared';

export interface ControlState {
  sessions: SessionInfo[];
  createSession: () => void;
  closeSession: (id: string, force?: boolean) => void;
  renameSession: (id: string, title: string) => void;
  pinSession: (id: string, pinned: boolean) => void;
  connected: boolean;
  retryIn: number | null;
}

interface ControlOptions {
  onSettingsChanged?: (settings: import('@chemuxer/shared').Settings) => void;
}

export function useControl(url: string, options?: ControlOptions): ControlState {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
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
    } else if (msg.type === 'session-created') {
      setSessions((prev) => [...prev, msg.session]);
    } else if (msg.type === 'session-closed') {
      setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
    } else if (msg.type === 'session-renamed') {
      setSessions((prev) =>
        prev.map((s) => s.id === msg.sessionId ? { ...s, title: msg.title, renamed: msg.renamed } : s)
      );
    } else if (msg.type === 'session-pinned') {
      setSessions((prev) =>
        prev.map((s) => s.id === msg.sessionId ? { ...s, pinned: msg.pinned } : s)
      );
    } else if (msg.type === 'settings-changed') {
      onSettingsChangedRef.current?.(msg.settings);
    }
  }, []);

  const connState = useReconnectingWebSocket(url, { onMessage: handleMessage });

  const send = useCallback((msg: object) => {
    if (connState.status === 'connected') {
      connState.ws.send(JSON.stringify(msg));
    }
  }, [connState]);

  const createSession = useCallback(() => send({ type: 'create' }), [send]);
  const closeSession = useCallback((id: string, force?: boolean) => {
    if (force) {
      send({ type: 'pin', sessionId: id, pinned: false });
    }
    send({ type: 'close', sessionId: id });
  }, [send]);
  const renameSession = useCallback((id: string, title: string) => send({ type: 'rename', sessionId: id, title }), [send]);
  const pinSession = useCallback((id: string, pinned: boolean) => send({ type: 'pin', sessionId: id, pinned }), [send]);

  return {
    sessions,
    createSession,
    closeSession,
    renameSession,
    pinSession,
    connected: connState.status === 'connected',
    retryIn: connState.status === 'disconnected' ? connState.retryIn : null,
  };
}
