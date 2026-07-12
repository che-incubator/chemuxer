import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerSendTerminalInput } from '../../tools/send-terminal-input.js';
import { DirectEndpointResolver } from '../../endpoint-resolver.js';
import { UpstreamError } from '../../chemuxer-client.js';
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
    sendInput: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callSendTerminalInput(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string; session_id: string; input: string },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerSendTerminalInput(server, store, client, resolver);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'send_terminal_input', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callSendTerminalInput>>) {
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

describe('send_terminal_input tool', () => {
  it('sends input and returns accepted: true', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callSendTerminalInput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      input: 'ls -la\n',
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.accepted).toBe(true);
    expect(body.workspace_status.workspace_name).toBe('ready-ws');
    expect(body.workspace_status.ready).toBe(true);

    expect(client.sendInput).toHaveBeenCalledWith('http://10.0.0.1:7681', 'sess-1', 'ls -la\n');
  });

  it('returns WORKSPACE_NOT_FOUND for unknown workspace', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callSendTerminalInput(store, client, {
      workspace: 'no-such-ws',
      session_id: 'sess-1',
      input: 'hello',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('returns UPSTREAM_ERROR for 500 from upstream', async () => {
    const client = makeClient({
      sendInput: vi.fn().mockRejectedValue(new UpstreamError(500, 'internal server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callSendTerminalInput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      input: 'hello',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });

  it('expands escape sequences before sending to upstream', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callSendTerminalInput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      input: '\\e[B\\r',
    });
    expect(result.isError).toBeFalsy();

    expect(client.sendInput).toHaveBeenCalledWith(
      'http://10.0.0.1:7681',
      'sess-1',
      '\x1b[B\r',
    );
  });

  it('returns error for invalid escape sequences', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callSendTerminalInput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      input: '\\q',
    });
    expect(result.isError).toBe(true);

    expect(client.sendInput).not.toHaveBeenCalled();

    const body = parseResult(result);
    expect(body.error_code).toBe('INVALID_INPUT');
    expect(body.message).toMatch(/unsupported escape/i);
  });
});
