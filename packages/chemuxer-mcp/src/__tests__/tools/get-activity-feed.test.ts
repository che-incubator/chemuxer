import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerGetActivityFeed } from '../../tools/get-activity-feed.js';
import { DirectEndpointResolver } from '../../endpoint-resolver.js';
import { UpstreamError } from '../../chemuxer-client.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';
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

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    getFeed: vi.fn().mockResolvedValue({ entries: [], nextSince: 'ts-0' }),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callTool(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: Record<string, unknown>,
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerGetActivityFeed(server, store, client, resolver);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'get_activity_feed', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callTool>>) {
  const text = (result.content as { type: string; text: string }[])[0].text;
  return JSON.parse(text);
}

const readyWsA = makeWs('ws-a', 'http://10.0.0.1:7681');
const readyWsB = makeWs('ws-b', 'http://10.0.0.2:7681');

describe('get_activity_feed tool', () => {
  describe('single-workspace mode', () => {
    it('returns entries with workspace_status', async () => {
      const feedResp: FeedResponse = {
        entries: [
          { timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'hello' },
          { timestamp: '2026-01-01T00:00:02Z', sessionId: 's1', content: 'world' },
        ],
        nextSince: '2026-01-01T00:00:02Z',
      };
      const client = makeClient({ getFeed: vi.fn().mockResolvedValue(feedResp) });
      const store = makeStore([readyWsA]);

      const result = await callTool(store, client, { workspace: 'ws-a' });
      expect(result.isError).toBeFalsy();

      const body = parseResult(result);
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].workspace_name).toBe('ws-a');
      expect(body.entries[0].content).toBe('hello');
      expect(body.nextSince).toBe('2026-01-01T00:00:02Z');
      expect(body.workspace_status.workspace_name).toBe('ws-a');
      expect(body.workspace_status.ready).toBe(true);
    });

    it('returns WORKSPACE_NOT_FOUND error', async () => {
      const client = makeClient();
      const store = makeStore([readyWsA]);

      const result = await callTool(store, client, { workspace: 'no-such-ws' });
      expect(result.isError).toBe(true);

      const body = parseResult(result);
      expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('forwards session_id in single-workspace mode', async () => {
      const getFeed = vi.fn().mockResolvedValue({ entries: [], nextSince: 'ts-0' });
      const client = makeClient({ getFeed });
      const store = makeStore([readyWsA]);

      await callTool(store, client, { workspace: 'ws-a', session_id: 'my-session' });

      expect(getFeed).toHaveBeenCalledWith('http://10.0.0.1:7681', 'my-session', undefined);
    });

    it('recalculates nextSince when entries are truncated by limit', async () => {
      const feedResp: FeedResponse = {
        entries: Array.from({ length: 10 }, (_, i) => ({
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
          sessionId: 's1',
          content: `entry-${i}`,
        })),
        nextSince: 'upstream-cursor-should-not-appear',
      };
      const client = makeClient({ getFeed: vi.fn().mockResolvedValue(feedResp) });
      const store = makeStore([readyWsA]);

      const result = await callTool(store, client, { workspace: 'ws-a', limit: 3 });
      expect(result.isError).toBeFalsy();

      const body = parseResult(result);
      expect(body.entries).toHaveLength(3);
      // nextSince must be the last included entry's timestamp, not the upstream cursor
      expect(body.nextSince).toBe('2026-01-01T00:00:02Z');
    });
  });

  describe('cross-workspace mode', () => {
    it('returns merged entries with status summary', async () => {
      const getFeed = vi.fn<ChemuxerClient['getFeed']>()
        .mockImplementation(async (endpoint) => {
          if (endpoint === 'http://10.0.0.1:7681') {
            return {
              entries: [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'a' }],
              nextSince: '2026-01-01T00:00:01Z',
            };
          }
          return {
            entries: [{ timestamp: '2026-01-01T00:00:02Z', sessionId: 's2', content: 'b' }],
            nextSince: '2026-01-01T00:00:02Z',
          };
        });

      const client = makeClient({ getFeed });
      const store = makeStore([readyWsA, readyWsB]);

      const result = await callTool(store, client, {});
      expect(result.isError).toBeFalsy();

      const body = parseResult(result);
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].workspace_name).toBe('ws-a');
      expect(body.entries[1].workspace_name).toBe('ws-b');
      expect(body.status.total).toBe(2);
      expect(body.status.succeeded).toBe(2);
      expect(body.status.failed).toBe(0);
      expect(body.partial_failures).toBeUndefined();
    });

    it('includes partial_failures when some workspaces fail', async () => {
      const getFeed = vi.fn<ChemuxerClient['getFeed']>()
        .mockImplementation(async (endpoint) => {
          if (endpoint === 'http://10.0.0.2:7681') {
            throw new UpstreamError(503, 'unavailable');
          }
          return {
            entries: [{ timestamp: '2026-01-01T00:00:01Z', sessionId: 's1', content: 'a' }],
            nextSince: 'ts-a',
          };
        });

      const client = makeClient({ getFeed });
      const store = makeStore([readyWsA, readyWsB]);

      const result = await callTool(store, client, {});
      expect(result.isError).toBeFalsy();

      const body = parseResult(result);
      expect(body.entries).toHaveLength(1);
      expect(body.partial_failures).toHaveLength(1);
      expect(body.partial_failures[0].workspace_name).toBe('ws-b');
      expect(body.status.succeeded).toBe(1);
      expect(body.status.failed).toBe(1);
    });

    it('returns isError when all workspaces fail', async () => {
      const getFeed = vi.fn<ChemuxerClient['getFeed']>()
        .mockRejectedValue(new UpstreamError(500, 'error'));

      const client = makeClient({ getFeed });
      const store = makeStore([readyWsA, readyWsB]);

      const result = await callTool(store, client, {});
      expect(result.isError).toBe(true);

      const body = parseResult(result);
      expect(body.error_code).toBe('UPSTREAM_ERROR');
      expect(body.partial_failures).toHaveLength(2);
    });

    it('limit truncation works', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        sessionId: 's1',
        content: `entry-${i}`,
      }));

      const getFeed = vi.fn<ChemuxerClient['getFeed']>()
        .mockResolvedValue({ entries, nextSince: 'ts-end' });

      const client = makeClient({ getFeed });
      const store = makeStore([readyWsA]);

      const result = await callTool(store, client, { limit: 3 });
      expect(result.isError).toBeFalsy();

      const body = parseResult(result);
      expect(body.entries).toHaveLength(3);
      // nextSince should be the timestamp of the last included entry
      expect(body.nextSince).toBe('2026-01-01T00:00:02Z');
    });
  });
});
