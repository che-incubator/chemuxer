import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ConnectionState } from '../hooks/useReconnectingWebSocket.js';

let connState: ConnectionState = { status: 'connecting' };
let setConnState: (s: ConnectionState) => void;

vi.mock('../hooks/useReconnectingWebSocket.js', () => ({
  useReconnectingWebSocket: () => connState,
}));

const termInstance = {
  cols: 120,
  rows: 40,
  loadAddon: vi.fn(),
  open: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onResize: vi.fn(() => ({ dispose: vi.fn() })),
  dispose: vi.fn(),
  write: vi.fn(),
  options: {} as Record<string, unknown>,
  parser: {
    registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })),
  },
};

vi.mock('@xterm/xterm', () => ({
  Terminal: function () { return termInstance; },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: function () {
    return { fit: vi.fn(), dispose: vi.fn() };
  },
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('@chemuxer/shared', () => ({
  resolveTheme: () => ({}),
}));

describe('Terminal', () => {
  let Terminal: typeof import('../components/Terminal.js').Terminal;

  beforeEach(async () => {
    vi.clearAllMocks();
    connState = { status: 'connecting' };
    const mod = await import('../components/Terminal.js');
    Terminal = mod.Terminal;
  });

  it('sends current dimensions to server when WebSocket connects', async () => {
    const mockSend = vi.fn();
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: mockSend,
    } as unknown as WebSocket;

    const { rerender } = render(
      <Terminal
        sessionId="s1"
        wsUrl="ws://localhost/ws"
        visible={true}
        settings={{
          terminal: { fontSize: 14, fontFamily: 'monospace', theme: 'catppuccin-mocha' },
          shell: { path: '' },
          scrollback: { size: 102400 },
        }}
      />
    );

    // WS connects
    connState = { status: 'connected', ws: mockWs };
    rerender(
      <Terminal
        sessionId="s1"
        wsUrl="ws://localhost/ws"
        visible={true}
        settings={{
          terminal: { fontSize: 14, fontFamily: 'monospace', theme: 'catppuccin-mocha' },
          shell: { path: '' },
          scrollback: { size: 102400 },
        }}
      />
    );

    expect(mockSend).toHaveBeenCalledWith(
      JSON.stringify({ type: 'resize', cols: 120, rows: 40 })
    );
  });
});
