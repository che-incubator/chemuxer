import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerListDevfileCommands } from '../../tools/list-devfile-commands.js';
import { DirectEndpointResolver } from '../../endpoint-resolver.js';
import { UpstreamError } from '../../chemuxer-client.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';
import type { DevfileCommand } from '@chemuxer/shared';

const resolver = new DirectEndpointResolver();

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    listDevfileCommands: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callListDevfileCommands(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerListDevfileCommands(server, store, client, resolver);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'list_devfile_commands', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callListDevfileCommands>>) {
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

const idledWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-2',
  workspace_name: 'idled-ws',
  pod_name: 'idled-ws-pod',
  phase: 'Running',
  ready: true,
  idled: true,
  endpoint: 'http://10.0.0.2:7681',
};

describe('list_devfile_commands tool', () => {
  it('returns devfile commands from a ready workspace', async () => {
    const commands: DevfileCommand[] = [
      { id: 'build', label: 'Build', component: 'dev-container', commandLine: 'go build ./...', group: 'build', isDefault: true },
      { id: 'test', component: 'dev-container', commandLine: 'go test ./...' },
    ];
    const client = makeClient({ listDevfileCommands: vi.fn().mockResolvedValue(commands) });
    const store = makeStore([readyWorkspace]);

    const result = await callListDevfileCommands(store, client, { workspace: 'ready-ws' });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.commands).toHaveLength(2);
    expect(body.commands[0].id).toBe('build');
    expect(body.commands[0].label).toBe('Build');
    expect(body.commands[1].id).toBe('test');
    expect(body.workspace_status.workspace_name).toBe('ready-ws');
    expect(body.workspace_status.ready).toBe(true);
  });

  it('returns empty commands array when none defined', async () => {
    const client = makeClient({ listDevfileCommands: vi.fn().mockResolvedValue([]) });
    const store = makeStore([readyWorkspace]);

    const result = await callListDevfileCommands(store, client, { workspace: 'ready-ws' });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.commands).toEqual([]);
  });

  it('returns WORKSPACE_NOT_FOUND for unknown workspace', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callListDevfileCommands(store, client, { workspace: 'no-such-ws' });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('returns WORKSPACE_IDLED for idled workspace', async () => {
    const client = makeClient();
    const store = makeStore([idledWorkspace]);

    const result = await callListDevfileCommands(store, client, { workspace: 'idled-ws' });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_IDLED');
  });

  it('returns UPSTREAM_ERROR when client throws', async () => {
    const client = makeClient({
      listDevfileCommands: vi.fn().mockRejectedValue(new UpstreamError(500, 'internal server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callListDevfileCommands(store, client, { workspace: 'ready-ws' });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });
});
