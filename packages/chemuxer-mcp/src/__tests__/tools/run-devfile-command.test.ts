import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerRunDevfileCommand } from '../../tools/run-devfile-command.js';
import { DirectEndpointResolver } from '../../endpoint-resolver.js';
import { UpstreamError } from '../../chemuxer-client.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';
import type { DevfileCommand, SessionInfo } from '@chemuxer/shared';

const resolver = new DirectEndpointResolver();

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

const mockSession: SessionInfo = {
  id: 'new-session-id',
  shell: '/bin/bash',
  title: 'bash',
  renamed: false,
  pinned: false,
  createdAt: 1000,
};

const buildCommand: DevfileCommand = {
  id: 'build',
  label: 'Build Project',
  component: 'dev-container',
  commandLine: 'go build ./...',
  workingDir: '${PROJECT_SOURCE}',
};

const testCommand: DevfileCommand = {
  id: 'test',
  component: 'dev-container',
  commandLine: 'go test ./...',
};

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    listDevfileCommands: vi.fn().mockResolvedValue([buildCommand, testCommand]),
    createSession: vi.fn().mockResolvedValue(mockSession),
    sendInput: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callRunDevfileCommand(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string; command_id: string },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerRunDevfileCommand(server, store, client, resolver);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'run_devfile_command', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callRunDevfileCommand>>) {
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

describe('run_devfile_command tool', () => {
  it('creates session, sends command with workingDir, returns session_id', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'build',
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.session_id).toBe('new-session-id');
    expect(body.command_id).toBe('build');
    expect(body.component).toBe('dev-container');

    expect(client.createSession).toHaveBeenCalledWith('http://10.0.0.1:7681', { pinned: false });
    expect(client.sendInput).toHaveBeenCalledWith(
      'http://10.0.0.1:7681',
      'new-session-id',
      "cd '${PROJECT_SOURCE}' && go build ./...\n",
    );
  });

  it('sends command without cd prefix when no workingDir', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'test',
    });
    expect(result.isError).toBeFalsy();

    expect(client.sendInput).toHaveBeenCalledWith(
      'http://10.0.0.1:7681',
      'new-session-id',
      'go test ./...\n',
    );
  });

  it('returns WORKSPACE_NOT_FOUND for unknown workspace', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'no-such-ws',
      command_id: 'build',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('returns WORKSPACE_IDLED for idled workspace', async () => {
    const client = makeClient();
    const store = makeStore([idledWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'idled-ws',
      command_id: 'build',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_IDLED');
  });

  it('returns COMMAND_NOT_FOUND when command_id does not match', async () => {
    const client = makeClient({ listDevfileCommands: vi.fn().mockResolvedValue([buildCommand]) });
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'nonexistent',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('COMMAND_NOT_FOUND');
    expect(body.message).toContain('nonexistent');
  });

  it('returns UPSTREAM_ERROR when listDevfileCommands throws', async () => {
    const client = makeClient({
      listDevfileCommands: vi.fn().mockRejectedValue(new UpstreamError(500, 'server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'build',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });

  it('returns UPSTREAM_ERROR when createSession throws', async () => {
    const client = makeClient({
      createSession: vi.fn().mockRejectedValue(new UpstreamError(500, 'server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'build',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });

  it('returns UPSTREAM_ERROR when sendInput throws', async () => {
    const client = makeClient({
      sendInput: vi.fn().mockRejectedValue(new UpstreamError(500, 'server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callRunDevfileCommand(store, client, {
      workspace: 'ready-ws',
      command_id: 'build',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });
});
