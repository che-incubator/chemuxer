import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useReconnectingWebSocket } from '../hooks/useReconnectingWebSocket.js';
import { resolveTheme, type Settings } from '../../../shared/settings.js';

const encoder = new TextEncoder();

interface TerminalProps {
  sessionId: string;
  wsUrl: string;
  visible: boolean;
  settings: Settings;
}

export function Terminal({ sessionId, wsUrl, visible, settings }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const fullUrl = `${wsUrl}/${sessionId}`;

  const handleMessage = useCallback((event: MessageEvent) => {
    const term = termRef.current;
    if (!term) return;
    const data = event.data instanceof ArrayBuffer
      ? new Uint8Array(event.data)
      : event.data;
    term.write(data);
  }, []);

  const connState = useReconnectingWebSocket(fullUrl, { onMessage: handleMessage });
  const ws = connState.status === 'connected' ? connState.ws : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const theme = resolveTheme(settings.terminal.theme);
    const term = new XTerm({
      cursorBlink: true,
      fontSize: settings.terminal.fontSize,
      fontFamily: settings.terminal.fontFamily,
      theme,
      vtExtensions: { kittyKeyboard: true },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(container);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !ws) return;

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(data));
      }
    });

    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    return () => {
      onData.dispose();
      onResize.dispose();
    };
  }, [ws]);

  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [visible]);

  useEffect(() => {
    if (termRef.current) {
      const theme = resolveTheme(settings.terminal.theme);
      termRef.current.options.fontSize = settings.terminal.fontSize;
      termRef.current.options.fontFamily = settings.terminal.fontFamily;
      termRef.current.options.theme = theme;
      fitRef.current?.fit();
    }
  }, [settings.terminal.fontSize, settings.terminal.fontFamily, settings.terminal.theme]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}
