import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReconnectingWebSocket } from '../hooks/useReconnectingWebSocket.js';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {}

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
}

describe('useReconnectingWebSocket', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('connects on mount and reports connected state', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.connected).toBe(true);
    expect(result.current.retryIn).toBeNull();
  });

  it('reconnects with exponential backoff after disconnect', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.retryIn).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('backoff increases: 1s, 2s, 4s', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => { MockWebSocket.instances[0].simulateClose(); });
    expect(result.current.retryIn).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    act(() => { MockWebSocket.instances[1].simulateClose(); });
    expect(result.current.retryIn).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(2001); });
    act(() => { MockWebSocket.instances[2].simulateClose(); });
    expect(result.current.retryIn).toBe(4);
  });

  it('resets backoff on successful reconnect', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => { MockWebSocket.instances[0].simulateClose(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });

    expect(result.current.connected).toBe(true);
    expect(result.current.retryIn).toBeNull();

    // Wait for backoff reset timeout to fire (10ms)
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });

    act(() => { MockWebSocket.instances[1].simulateClose(); });
    expect(result.current.retryIn).toBe(1);
  });

  it('countdown decrements every second', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => { MockWebSocket.instances[0].simulateClose(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });

    act(() => { MockWebSocket.instances[1].simulateClose(); });
    expect(result.current.retryIn).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.retryIn).toBe(1);
  });

  it('caps backoff at 30s', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    for (let i = 0; i < 6; i++) {
      act(() => { MockWebSocket.instances[i].simulateClose(); });
      const expected = Math.min(30, Math.pow(2, i));
      await act(async () => { await vi.advanceTimersByTimeAsync(expected * 1000 + 1); });
    }

    act(() => { MockWebSocket.instances[6].simulateClose(); });
    expect(result.current.retryIn).toBe(30);
  });

  it('ws is set immediately on connect (before open)', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    expect(result.current.ws).not.toBeNull();
    expect(result.current.ws).toBeInstanceOf(MockWebSocket);
    expect(result.current.connected).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.connected).toBe(true);
  });

  it('ws becomes null after disconnect and non-null after reconnect', async () => {
    const { result } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.ws).not.toBeNull();

    act(() => { MockWebSocket.instances[0].simulateClose(); });
    expect(result.current.ws).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });

    expect(result.current.ws).not.toBeNull();
    expect(result.current.ws).toBeInstanceOf(MockWebSocket);
  });

  it('sets binaryType to arraybuffer on the socket', async () => {
    renderHook(() => useReconnectingWebSocket('ws://test'));

    const socket = MockWebSocket.instances[0];
    expect(socket.binaryType).toBe('arraybuffer');
  });

  it('cleans up on unmount', async () => {
    const { unmount } = renderHook(() => useReconnectingWebSocket('ws://test'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    unmount();
    expect(MockWebSocket.instances[0].closed).toBe(true);
  });
});
