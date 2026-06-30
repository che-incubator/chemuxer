import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDevfileCommands } from '../hooks/useDevfileCommands';

describe('useDevfileCommands', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fetch devfile commands on mount', async () => {
    const mockCommands = [
      { id: 'build', label: 'Build', component: 'tools', commandLine: 'npm run build' },
      { id: 'test', label: 'Test', component: 'tools', commandLine: 'npm test' },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCommands,
    });

    const { result } = renderHook(() => useDevfileCommands());

    expect(result.current.loading).toBe(true);
    expect(result.current.commands).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.commands).toEqual(mockCommands);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/devfile-commands');
  });

  it('should handle fetch errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useDevfileCommands());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.commands).toEqual([]);
    expect(result.current.error).toBe('Failed to load devfile commands: 500 Internal Server Error');
  });

  it('should not refetch if cache is fresh (< 30s)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'build', component: 'tools', commandLine: 'build' }],
    });

    const { result } = renderHook(() => useDevfileCommands());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Call revalidateIfStale immediately (cache is fresh)
    result.current.revalidateIfStale();

    // Should not trigger another fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should refetch if cache is stale (>= 30s)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'build', component: 'tools', commandLine: 'build' }],
    });

    const { result } = renderHook(() => useDevfileCommands());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mock time passing (30+ seconds)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'test', component: 'tools', commandLine: 'test' }],
    });

    // Call revalidateIfStale (cache is stale)
    result.current.revalidateIfStale();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(result.current.commands).toEqual([
      { id: 'test', component: 'tools', commandLine: 'test' },
    ]);
  });
});
