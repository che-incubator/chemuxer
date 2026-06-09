import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_BACKOFF = 30;

export interface ReconnectingWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
}

export interface ReconnectingWebSocket {
  ws: WebSocket | null;
  connected: boolean;
  retryIn: number | null;
}

export function useReconnectingWebSocket(url: string, options?: ReconnectingWebSocketOptions): ReconnectingWebSocket {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [retryIn, setRetryIn] = useState<number | null>(null);
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
    setWs(socket);

    socket.onmessage = (event) => {
      onMessageRef.current?.(event);
    };

    socket.onopen = () => {
      if (unmountedRef.current) return;
      setConnected(true);
      setRetryIn(null);
      clearTimers();

      resetBackoffTimeoutRef.current = setTimeout(() => {
        backoffRef.current = 1;
      }, 10);
    };

    socket.onclose = () => {
      if (unmountedRef.current) return;
      socketRef.current = null;
      setWs(null);
      setConnected(false);

      if (resetBackoffTimeoutRef.current) {
        clearTimeout(resetBackoffTimeoutRef.current);
        resetBackoffTimeoutRef.current = null;
      }

      const delay = backoffRef.current;
      setRetryIn(delay);
      backoffRef.current = Math.min(MAX_BACKOFF, delay * 2);

      countdownRef.current = setInterval(() => {
        setRetryIn((prev) => {
          if (prev === null || prev <= 1) return prev;
          return prev - 1;
        });
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

  return { ws, connected, retryIn };
}
