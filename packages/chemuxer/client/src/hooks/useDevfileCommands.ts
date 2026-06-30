import { useState, useEffect, useCallback, useRef } from 'react';
import type { DevfileCommand } from '@chemuxer/shared';
import { basePath } from '../utils/basePath';

interface UseDevfileCommandsResult {
  commands: DevfileCommand[];
  loading: boolean;
  error: string | null;
  revalidateIfStale: () => void;
}

const CACHE_TTL_MS = 30000; // 30 seconds

export function useDevfileCommands(): UseDevfileCommandsResult {
  const [commands, setCommands] = useState<DevfileCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedAtRef = useRef<number>(0);

  const fetchCommands = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${basePath()}/api/devfile-commands`);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setCommands(data);
      fetchedAtRef.current = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load devfile commands: ${message}`);
      setCommands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const revalidateIfStale = useCallback(() => {
    const now = Date.now();
    const age = now - fetchedAtRef.current;

    if (age >= CACHE_TTL_MS) {
      fetchCommands();
    }
  }, [fetchCommands]);

  useEffect(() => {
    fetchCommands();
  }, [fetchCommands]);

  return {
    commands,
    loading,
    error,
    revalidateIfStale,
  };
}
