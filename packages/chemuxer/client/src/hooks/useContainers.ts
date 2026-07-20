import { useState, useEffect, useCallback, useRef } from 'react';
import type { ContainerInfo } from '@chemuxer/shared';
import { basePath } from '../utils/basePath';

interface UseContainersResult {
  containers: ContainerInfo[];
  loading: boolean;
  revalidateIfStale: () => void;
}

const CACHE_TTL_MS = 10000;

export function useContainers(): UseContainersResult {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const fetchContainers = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    try {
      const res = await fetch(`${basePath()}/api/containers`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setContainers(Array.isArray(data) ? data : []);
      fetchedAtRef.current = Date.now();
    } catch {
      setContainers([]);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  const revalidateIfStale = useCallback(() => {
    if (Date.now() - fetchedAtRef.current >= CACHE_TTL_MS) {
      fetchContainers();
    }
  }, [fetchContainers]);

  useEffect(() => { fetchContainers(); }, [fetchContainers]);

  return { containers, loading, revalidateIfStale };
}
