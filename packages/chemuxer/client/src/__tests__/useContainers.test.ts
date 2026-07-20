import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useContainers } from '../hooks/useContainers.js';

describe('useContainers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
        { name: 'tools', state: 'running', ready: true, isDefault: false },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches container list from /api/containers', async () => {
    const { result } = renderHook(() => useContainers());

    await waitFor(() => {
      expect(result.current.containers).toHaveLength(2);
    });

    expect(result.current.containers[0].name).toBe('dev');
    expect(result.current.containers[0].isDefault).toBe(true);
    expect(result.current.containers[1].name).toBe('tools');
  });

  it('returns empty array on fetch error', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useContainers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.containers).toEqual([]);
  });
});
