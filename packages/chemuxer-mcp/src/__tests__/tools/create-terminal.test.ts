import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerCreateTerminal } from '../../tools/create-terminal.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';
import type { SessionInfo } from '@chemuxer/shared';

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    createSession: vi.fn().mockResolvedValue({
      id: 'new-sess',
      shell: '/bin/bash',
      title: 'bash',
      renamed: false,
      createdAt: 3000,
    }),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callCreateTerminal(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string; shell?: string; title?: string },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerCreateTerminal(server, store, client);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'create_terminal', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callCreateTerminal>>) {
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

const notReadyWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-3',
  workspace_name: 'starting-ws',
  pod_name: 'starting-ws-pod',
  phase: 'Starting',
  ready: false,
  idled: false,
  endpoint: undefined,
};

describe('create_terminal tool', () => {
  it('creates session and returns SessionInfo', async () => {
    const createdSession: SessionInfo = {
      id: 'new-sess',
      shell: '/bin/bash',
      title: 'bash',
      renamed: false,
      createdAt: 3000,
    };
    const client = makeClient({ createSession: vi.fn().mockResolvedValue(createdSession) });
    const store = makeStore([readyWorkspace]);

    const result = await callCreateTerminal(store, client, { workspace: 'ready-ws' });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.session.id).toBe('new-sess');
    expect(body.session.shell).toBe('/bin/bash');
    expect(body.workspace_status.workspace_name).toBe('ready-ws');
    expect(body.workspace_status.ready).toBe(true);

    expect(client.createSession).toHaveBeenCalledWith('http://10.0.0.1:7681');
  });

  it('returns WORKSPACE_NOT_READY for non-ready workspace', async () => {
    const client = makeClient();
    const store = makeStore([notReadyWorkspace]);

    const result = await callCreateTerminal(store, client, { workspace: 'starting-ws' });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_READY');
  });
});
