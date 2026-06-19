import type { FeedEntry } from '@chemuxer/shared';
import type { WorkspaceInfo } from './workspace-store.js';
import type { ChemuxerClient } from './chemuxer-client.js';
import type { ErrorCode } from './errors.js';
import { classifyError } from './tools/tool-helpers.js';

export type AugmentedFeedEntry = FeedEntry & { workspace_name: string };

export interface FanOutResult {
  entries: AugmentedFeedEntry[];
  nextSince: string | null;
  partialFailures?: Array<{ workspace_name: string; code: ErrorCode; message: string }>;
}

interface DeferredTask {
  resolve: () => void;
}

type TaskResult =
  | { kind: 'success'; entries: AugmentedFeedEntry[]; nextSince: string | null }
  | { kind: 'failure'; workspace_name: string; code: ErrorCode; message: string };

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

  const tasks: Promise<TaskResult>[] = [];

  for (const ws of ready) {
    // Budget check before dispatching
    if (now() >= deadline) {
      tasks.push(Promise.resolve({
        kind: 'failure' as const,
        workspace_name: ws.workspace_name,
        code: 'UPSTREAM_TIMEOUT' as const,
        message: 'Budget expired before request could be dispatched',
      }));
      continue;
    }

    const task = acquire().then(async (): Promise<TaskResult> => {
      // Re-check budget after acquiring the semaphore slot — time may have
      // passed while waiting for a concurrency slot to open up.
      if (now() >= deadline) {
        release();
        return {
          kind: 'failure',
          workspace_name: ws.workspace_name,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Budget expired before request could be dispatched',
        };
      }
      try {
        const resp = await client.getFeed(ws.endpoint!, sessionId, since);
        const entries: AugmentedFeedEntry[] = resp.entries.map((e) => ({
          ...e,
          workspace_name: ws.workspace_name,
        }));
        return { kind: 'success', entries, nextSince: resp.nextSince ?? null };
      } catch (err) {
        const classified = classifyError(err);
        return {
          kind: 'failure',
          workspace_name: ws.workspace_name,
          code: classified?.errorCode ?? 'UPSTREAM_ERROR',
          message: classified?.message ?? (err instanceof Error ? err.message : String(err)),
        };
      } finally {
        release();
      }
    });

    tasks.push(task);
  }

  const results = await Promise.all(tasks);

  // Merge results synchronously
  const allEntries: AugmentedFeedEntry[] = [];
  const partialFailures: Array<{ workspace_name: string; code: ErrorCode; message: string }> = [];
  const successNextSinces: string[] = [];

  for (const r of results) {
    if (r.kind === 'success') {
      allEntries.push(...r.entries);
      if (r.nextSince) {
        successNextSinces.push(r.nextSince);
      }
    } else {
      partialFailures.push({ workspace_name: r.workspace_name, code: r.code, message: r.message });
    }
  }

  // Sort: timestamp ASC, workspace_name ASC, sessionId ASC
  allEntries.sort((a, b) => {
    const tCmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
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
