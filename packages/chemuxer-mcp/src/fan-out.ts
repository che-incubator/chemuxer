import type { FeedEntry } from '@chemuxer/shared';
import type { WorkspaceInfo } from './workspace-store.js';
import type { ChemuxerClient } from './chemuxer-client.js';
import type { ErrorCode } from './errors.js';
import { UpstreamError } from './chemuxer-client.js';

export type AugmentedFeedEntry = FeedEntry & { workspace_name: string };

export interface FanOutResult {
  entries: AugmentedFeedEntry[];
  nextSince: string | null;
  partialFailures?: Array<{ workspace_name: string; code: ErrorCode; message: string }>;
}

interface DeferredTask {
  resolve: () => void;
}

export async function fanOutFeed(
  workspaces: WorkspaceInfo[],
  client: ChemuxerClient,
  opts?: {
    since?: string;
    sessionId?: string;
    concurrency?: number;
    budgetMs?: number;
    now?: () => number;
  },
): Promise<FanOutResult> {
  const concurrency = opts?.concurrency ?? 10;
  const budgetMs = opts?.budgetMs ?? 5000;
  const now = opts?.now ?? Date.now;
  const since = opts?.since;
  const sessionId = opts?.sessionId;

  const deadline = now() + budgetMs;

  // Step 1: filter to workspaces with endpoints
  const ready = workspaces.filter((ws) => !!ws.endpoint);

  if (ready.length === 0) {
    return { entries: [], nextSince: null };
  }

  const allEntries: AugmentedFeedEntry[] = [];
  const partialFailures: Array<{ workspace_name: string; code: ErrorCode; message: string }> = [];
  const successNextSinces: string[] = [];

  // Semaphore-based bounded worker pool
  let running = 0;
  const waitQueue: DeferredTask[] = [];

  function acquire(): Promise<void> {
    if (running < concurrency) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waitQueue.push({ resolve });
    });
  }

  function release(): void {
    const next = waitQueue.shift();
    if (next) {
      next.resolve();
    } else {
      running--;
    }
  }

  const tasks: Promise<void>[] = [];

  for (const ws of ready) {
    // Budget check before dispatching
    if (now() >= deadline) {
      partialFailures.push({
        workspace_name: ws.workspace_name,
        code: 'UPSTREAM_TIMEOUT',
        message: 'Budget expired before request could be dispatched',
      });
      continue;
    }

    const task = acquire().then(async () => {
      // Re-check budget after acquiring the semaphore slot — time may have
      // passed while waiting for a concurrency slot to open up.
      if (now() >= deadline) {
        partialFailures.push({
          workspace_name: ws.workspace_name,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Budget expired before request could be dispatched',
        });
        release();
        return;
      }
      try {
        const resp = await client.getFeed(ws.endpoint!, sessionId, since);
        const augmented: AugmentedFeedEntry[] = resp.entries.map((e) => ({
          ...e,
          workspace_name: ws.workspace_name,
        }));
        allEntries.push(...augmented);
        if (resp.nextSince) {
          successNextSinces.push(resp.nextSince);
        }
      } catch (err) {
        if (err instanceof UpstreamError) {
          partialFailures.push({
            workspace_name: ws.workspace_name,
            code: 'UPSTREAM_ERROR',
            message: err.message,
          });
        } else if (err instanceof DOMException && err.name === 'TimeoutError') {
          partialFailures.push({
            workspace_name: ws.workspace_name,
            code: 'UPSTREAM_TIMEOUT',
            message: 'Request timed out',
          });
        } else {
          partialFailures.push({
            workspace_name: ws.workspace_name,
            code: 'UPSTREAM_ERROR',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        release();
      }
    });

    tasks.push(task);
  }

  await Promise.all(tasks);

  // Sort: timestamp ASC, workspace_name ASC, sessionId ASC
  allEntries.sort((a, b) => {
    const tCmp = a.timestamp.localeCompare(b.timestamp);
    if (tCmp !== 0) return tCmp;
    const wCmp = a.workspace_name.localeCompare(b.workspace_name);
    if (wCmp !== 0) return wCmp;
    return a.sessionId.localeCompare(b.sessionId);
  });

  // Compute nextSince: max of successful nextSince values
  let nextSince: string | null = null;
  if (successNextSinces.length > 0) {
    nextSince = successNextSinces.reduce((max, cur) => (cur > max ? cur : max));
  } else if (since) {
    nextSince = since;
  }

  const result: FanOutResult = { entries: allEntries, nextSince };
  if (partialFailures.length > 0) {
    result.partialFailures = partialFailures;
  }
  return result;
}
