import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_BACKOFF = 30;

export interface ReconnectingWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
}

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; ws: WebSocket }
  | { status: 'disconnected'; retryIn: number };

export function useReconnectingWebSocket(url: string, options?: ReconnectingWebSocketOptions): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' });
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(options?.onMessage);
  const backoffRef = useRef(1);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetBackoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  onMessageRef.current = options?.onMessage;

  const clearTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (resetBackoffTimeoutRef.current) {
      clearTimeout(resetBackoffTimeoutRef.current);
      resetBackoffTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    clearTimers();

    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onmessage = (event) => {
      onMessageRef.current?.(event);
    };

    socket.onopen = () => {
      if (unmountedRef.current || socketRef.current !== socket) return;
      setState({ status: 'connected', ws: socket });
      clearTimers();

      resetBackoffTimeoutRef.current = setTimeout(() => {
        backoffRef.current = 1;
      }, 10);
    };

    socket.onclose = () => {
      if (unmountedRef.current || socketRef.current !== socket) return;
      socketRef.current = null;

      if (resetBackoffTimeoutRef.current) {
        clearTimeout(resetBackoffTimeoutRef.current);
        resetBackoffTimeoutRef.current = null;
      }

      const delay = backoffRef.current;
      setState({ status: 'disconnected', retryIn: delay });
      backoffRef.current = Math.min(MAX_BACKOFF, delay * 2);

      countdownRef.current = setInterval(() => {
        setState((prev) =>
          prev.status === 'disconnected' && prev.retryIn > 1
            ? { ...prev, retryIn: prev.retryIn - 1 }
            : prev
        );
      }, 1000);

      retryTimeoutRef.current = setTimeout(() => {
        clearTimers();
        connect();
      }, delay * 1000);
    };
  }, [url, clearTimers]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect, clearTimers]);

  return state;
}
