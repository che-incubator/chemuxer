import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useReconnectingWebSocket } from '../hooks/useReconnectingWebSocket.js';
import { resolveTheme, type Settings } from '@chemuxer/shared';

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
    // Suppress OSC 10 and OSC 11 color queries to prevent prompt corruption on high-latency connections
    term.parser.registerOscHandler(10, () => true);
    term.parser.registerOscHandler(11, () => true);
    
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      fit.fit();
    }

    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fit.fit();
      }
    });
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

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }

    return () => {
      onData.dispose();
      onResize.dispose();
    };
  }, [ws]);

  useEffect(() => {
    if (visible && fitRef.current) {
      // Use a tiny timeout to ensure the DOM has applied display: block and computed dimensions
      const timeoutId = setTimeout(() => {
        if (containerRef.current?.clientWidth && containerRef.current?.clientHeight) {
          fitRef.current?.fit();
        }
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [visible]);

  useEffect(() => {
    if (termRef.current) {
      const theme = resolveTheme(settings.terminal.theme);
      termRef.current.options.fontSize = settings.terminal.fontSize;
      termRef.current.options.fontFamily = settings.terminal.fontFamily;
      termRef.current.options.theme = theme;
      if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
        fitRef.current?.fit();
      }
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
