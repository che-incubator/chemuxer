import { describe, it, expect, vi } from 'vitest';
import { fanOutFeed } from '../fan-out.js';
import { DirectEndpointResolver } from '../endpoint-resolver.js';
import { UpstreamError } from '../chemuxer-client.js';
import type { WorkspaceInfo } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { FeedResponse } from '@chemuxer/shared';

const resolver = new DirectEndpointResolver();

function makeWs(name: string, endpoint: string | null = 'http://10.0.0.1:7681'): WorkspaceInfo {
  return {
    workspace_id: `id-${name}`,
    workspace_name: name,
    pod_name: `${name}-pod`,
    phase: 'Running',
    ready: !!endpoint,
    idled: false,
    endpoint,
  };
}

function makeClient(
  getFeedImpl: ChemuxerClient['getFeed'] = vi.fn().mockResolvedValue({ entries: [], nextSince: 'ts-0' }),
): ChemuxerClient {
  return { getFeed: getFeedImpl } as unknown as ChemuxerClient;
}

function feedResponse(entries: Array<{ timestamp: string; sessionId: string; content: string }>, nextSince: string): FeedResponse {
  return { entries, nextSince };
}

describe('fanOutFeed', () => {
  it('uses resolved endpoint instead of ws.endpoint', async () => {
    const getFeed = vi.fn().mockResolvedValue(feedResponse([], 'ts-0'));
    const stubResolver = {
      resolve: vi.fn().mockReturnValue('http://resolved:9999'),
    };

    await fanOutFeed([makeWs('ws-a', 'http://original:7681')], makeClient(getFeed), stubResolver);

    expect(getFeed).toHaveBeenCalledWith('http://resolved:9999', undefined, undefined);
  });

  it('merges entries from 2 workspaces chronologically', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async (endpoint) => {
        if (endpoint === 'http://ws-a:7681') {
          return feedResponse(
            [
              { timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'a1' },
              { timestamp: '2026-01-01T00:00:03Z', sessionId: 's1', content: 'a3' },
            ],
            'ts-a',
          );
        }
        return feedResponse(
          [{ timestamp: '2026-01-01T00:00:02Z', sessionId: 's2', content: 'b2' }],
          'ts-b',
        );
      });

    const result = await fanOutFeed(
      [makeWs('ws-a', 'http://ws-a:7681'), makeWs('ws-b', 'http://ws-b:7681')],
      makeClient(getFeed),
      resolver,
    );

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].content).toBe('a1');
    expect(result.entries[0].workspace_name).toBe('ws-a');
    expect(result.entries[1].content).toBe('b2');
    expect(result.entries[1].workspace_name).toBe('ws-b');
    expect(result.entries[2].content).toBe('a3');
    expect(result.partialFailures).toBeUndefined();
  });

  it('breaks ties by workspace_name then sessionId', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async (endpoint) => {
        if (endpoint === 'http://ws-b:7681') {
          return feedResponse(
            [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's2', content: 'b' }],
            'ts-b',
          );
        }
        return feedResponse(
          [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'a' }],
          'ts-a',
        );
      });

    const result = await fanOutFeed(
      [makeWs('ws-b', 'http://ws-b:7681'), makeWs('ws-a', 'http://ws-a:7681')],
      makeClient(getFeed),
      resolver,
    );

    // Same timestamp → sorted by workspace_name ASC: ws-a before ws-b
    expect(result.entries[0].workspace_name).toBe('ws-a');
    expect(result.entries[0].sessionId).toBe('s1');
    expect(result.entries[1].workspace_name).toBe('ws-b');
    expect(result.entries[1].sessionId).toBe('s2');
  });

  it('reports partial failure while keeping good entries', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async (endpoint) => {
        if (endpoint === 'http://ws-bad:7681') {
          throw new UpstreamError(500, 'internal error');
        }
        return feedResponse(
          [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'good' }],
          'ts-good',
        );
      });

    const result = await fanOutFeed(
      [makeWs('ws-good', 'http://ws-good:7681'), makeWs('ws-bad', 'http://ws-bad:7681')],
      makeClient(getFeed),
      resolver,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].workspace_name).toBe('ws-good');
    expect(result.partialFailures).toHaveLength(1);
    expect(result.partialFailures![0].workspace_name).toBe('ws-bad');
    expect(result.partialFailures![0].code).toBe('UPSTREAM_ERROR');
  });

  it('respects concurrency cap', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async () => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;
        return feedResponse([], 'ts');
      });

    const workspaces = Array.from({ length: 5 }, (_, i) =>
      makeWs(`ws-${i}`, `http://ws-${i}:7681`),
    );

    await fanOutFeed(workspaces, makeClient(getFeed), resolver, { concurrency: 2 });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(getFeed).toHaveBeenCalledTimes(5);
  });

  it('budget timeout: slow workspaces after budget go to partialFailures', async () => {
    let tick = 0;
    const fakeClock = () => tick;

    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async () => {
        // Each call "takes" 100ms
        tick += 100;
        return feedResponse(
          [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'ok' }],
          'ts',
        );
      });

    const workspaces = Array.from({ length: 5 }, (_, i) =>
      makeWs(`ws-${i}`, `http://ws-${i}:7681`),
    );

    const result = await fanOutFeed(workspaces, makeClient(getFeed), resolver, {
      concurrency: 1,
      budgetMs: 250,
      now: fakeClock,
    });

    // With concurrency=1 and budget=250ms, clock advances 100ms per call.
    // Deadline = 0 + 250 = 250.
    // ws-0: dispatch at tick=0 (<250), call advances to 100
    // ws-1: dispatch at tick=100 (<250), call advances to 200
    // ws-2: dispatch at tick=200 (<250), call advances to 300
    // ws-3: dispatch at tick=300 (>=250), budget expired → partialFailure
    // ws-4: same
    expect(result.entries).toHaveLength(3);
    expect(result.partialFailures).toHaveLength(2);
    expect(result.partialFailures![0].code).toBe('UPSTREAM_TIMEOUT');
    expect(result.partialFailures![1].code).toBe('UPSTREAM_TIMEOUT');
  });

  it('skips non-ready workspaces (no endpoint)', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockResolvedValue(feedResponse([], 'ts'));

    const result = await fanOutFeed(
      [makeWs('ws-ready', 'http://ws:7681'), makeWs('ws-not-ready', null)],
      makeClient(getFeed),
      resolver,
    );

    expect(getFeed).toHaveBeenCalledTimes(1);
    expect(result.partialFailures).toBeUndefined();
  });

  it('empty input returns empty result', async () => {
    const result = await fanOutFeed([], makeClient(), resolver);

    expect(result.entries).toHaveLength(0);
    expect(result.nextSince).toBeNull();
    expect(result.partialFailures).toBeUndefined();
  });

  it('all fail returns partialFailures with no entries', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockRejectedValue(new UpstreamError(503, 'unavailable'));

    const result = await fanOutFeed(
      [makeWs('ws-a', 'http://ws-a:7681'), makeWs('ws-b', 'http://ws-b:7681')],
      makeClient(getFeed),
      resolver,
    );

    expect(result.entries).toHaveLength(0);
    expect(result.partialFailures).toHaveLength(2);
    expect(result.nextSince).toBeNull();
  });

  it('nextSince is max of successful responses', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async (endpoint) => {
        if (endpoint === 'http://ws-a:7681') {
          return feedResponse([], '2026-01-01T00:00:10Z');
        }
        return feedResponse([], '2026-01-01T00:00:05Z');
      });

    const result = await fanOutFeed(
      [makeWs('ws-a', 'http://ws-a:7681'), makeWs('ws-b', 'http://ws-b:7681')],
      makeClient(getFeed),
      resolver,
    );

    expect(result.nextSince).toBe('2026-01-01T00:00:10Z');
  });

  it('nextSince echoes input since when all fail', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockRejectedValue(new UpstreamError(500, 'error'));

    const result = await fanOutFeed(
      [makeWs('ws-a', 'http://ws-a:7681')],
      makeClient(getFeed),
      resolver,
      { since: '2026-01-01T00:00:00Z' },
    );

    expect(result.nextSince).toBe('2026-01-01T00:00:00Z');
    expect(result.partialFailures).toHaveLength(1);
  });

  it('handles DOMException timeout errors', async () => {
    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));

    const result = await fanOutFeed(
      [makeWs('ws-a', 'http://ws-a:7681')],
      makeClient(getFeed),
      resolver,
    );

    expect(result.partialFailures).toHaveLength(1);
    expect(result.partialFailures![0].code).toBe('UPSTREAM_TIMEOUT');
  });

  it('no lost entries under high concurrency (20 workspaces, concurrency 10)', async () => {
    const entriesPerWs = 5;
    const workspaces = Array.from({ length: 20 }, (_, i) =>
      makeWs(`ws-${i}`, `http://ws-${i}:7681`),
    );

    const getFeed = vi.fn<ChemuxerClient['getFeed']>()
      .mockImplementation(async (endpoint) => {
        // Small random-ish delay to interleave resolution order
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        const wsIndex = endpoint.match(/ws-(\d+)/)?.[1] ?? '0';
        const entries = Array.from({ length: entriesPerWs }, (_, j) => ({
          timestamp: `2026-01-01T00:00:${String(parseInt(wsIndex) * entriesPerWs + j).padStart(2, '0')}Z`,
          sessionId: `s-${wsIndex}`,
          content: `ws-${wsIndex}-entry-${j}`,
        }));
        return feedResponse(entries, `ts-${wsIndex}`);
      });

    const result = await fanOutFeed(workspaces, makeClient(getFeed), resolver, { concurrency: 10 });

    expect(result.entries).toHaveLength(100);
    expect(result.partialFailures).toBeUndefined();
    expect(getFeed).toHaveBeenCalledTimes(20);
  });
});
