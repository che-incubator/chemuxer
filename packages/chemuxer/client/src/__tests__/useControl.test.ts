import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useControl } from '../hooks/useControl.js';
import type { ServerControlMessage, SessionInfo } from '@chemuxer/shared';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  simulateMessage(msg: ServerControlMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe('useControl', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  async function setupHook(options?: Parameters<typeof useControl>[1]) {
    const hook = renderHook(() => useControl('ws://test/ws/control', options));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return hook;
  }

  it('initializes with empty sessions', async () => {
    const { result } = await setupHook();
    expect(result.current.sessions).toEqual([]);
  });

  it('populates sessions from initial sessions message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    const sessions: SessionInfo[] = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, pinned: false, createdAt: 1000, container: '' },
    ];

    act(() => {
      ws.simulateMessage({ type: 'sessions', sessions });
    });

    expect(result.current.sessions).toEqual(sessions);
  });

  it('adds session on session-created message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateMessage({ type: 'sessions', sessions: [] });
    });

    const newSession: SessionInfo = { id: 'b', shell: '/bin/bash', title: 'bash', renamed: false, pinned: false, createdAt: 2000, container: '' };

    act(() => {
      ws.simulateMessage({ type: 'session-created', session: newSession });
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('b');
  });

  it('removes session on session-closed message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    const sessions: SessionInfo[] = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, pinned: false, createdAt: 1000, container: '' },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, pinned: false, createdAt: 2000, container: '' },
    ];

    act(() => {
      ws.simulateMessage({ type: 'sessions', sessions });
    });

    act(() => {
      ws.simulateMessage({ type: 'session-closed', sessionId: 'a', exitCode: 0 });
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('b');
  });

  it('createSession sends create message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.createSession();
    });

    expect(ws.sent).toContainEqual(JSON.stringify({ type: 'create' }));
  });

  it('closeSession sends close message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.closeSession('a');
    });

    expect(ws.sent).toContainEqual(JSON.stringify({ type: 'close', sessionId: 'a' }));
  });

  it('renameSession sends rename message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.renameSession('a', 'dev server');
    });

    expect(ws.sent).toContainEqual(JSON.stringify({ type: 'rename', sessionId: 'a', title: 'dev server' }));
  });

  it('updates session title on session-renamed message', async () => {
    const { result } = await setupHook();
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateMessage({ type: 'sessions', sessions: [
        { id: 'a', shell: '/bin/zsh', title: 'zsh', renamed: false, pinned: false, createdAt: 1000, container: '' },
      ] });
    });

    act(() => {
      ws.simulateMessage({ type: 'session-renamed', sessionId: 'a', title: 'dev server', renamed: true });
    });

    expect(result.current.sessions[0].title).toBe('dev server');
    expect(result.current.sessions[0].renamed).toBe(true);
  });

  it('calls onSettingsChanged when settings-changed message received', async () => {
    const onSettingsChanged = vi.fn();
    const { result } = await setupHook({ onSettingsChanged });
    const ws = MockWebSocket.instances[0];

    const settings = {
      terminal: { fontFamily: 'monospace', fontSize: 16, theme: 'catppuccin-latte' },
      shell: { path: '' },
      scrollback: { lines: 5000 },
    };

    act(() => {
      ws.simulateMessage({ type: 'settings-changed', settings } as any);
    });

    expect(onSettingsChanged).toHaveBeenCalledWith(settings);
  });

  it('exposes connected state', async () => {
    const { result } = await setupHook();
    expect(result.current.connected).toBe(true);
  });

  it('exposes retryIn state', async () => {
    const { result } = await setupHook();
    expect(result.current.retryIn).toBeNull();
  });
});
