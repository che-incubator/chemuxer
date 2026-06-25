import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerCloseTerminal } from '../../tools/close-terminal.js';
import { DirectEndpointResolver } from '../../endpoint-resolver.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';

const resolver = new DirectEndpointResolver();

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    closeSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callCloseTerminal(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string; session_id: string },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerCloseTerminal(server, store, client, resolver);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'close_terminal', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callCloseTerminal>>) {
  const text = (result.content as { type: string; text: string }[])[0].text;
  return JSON.parse(text);
}

const readyWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-1',
  workspace_name: 'ready-ws',
  pod_name: 'ready-ws-pod',
  phase: 'Running',
  ready: true,
  idled: false,
  endpoint: 'http://10.0.0.1:7681',
};

describe('close_terminal tool', () => {
  it('closes session and returns closed: true', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callCloseTerminal(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.closed).toBe(true);
    expect(body.workspace_status.workspace_name).toBe('ready-ws');
    expect(body.workspace_status.ready).toBe(true);

    expect(client.closeSession).toHaveBeenCalledWith('http://10.0.0.1:7681', 'sess-1');
  });

  it('returns WORKSPACE_NOT_FOUND for unknown workspace', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callCloseTerminal(store, client, {
      workspace: 'no-such-ws',
      session_id: 'sess-1',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
  });
});
