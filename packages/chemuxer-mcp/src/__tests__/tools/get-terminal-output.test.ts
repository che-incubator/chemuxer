import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerGetTerminalOutput } from '../../tools/get-terminal-output.js';
import { UpstreamError } from '../../chemuxer-client.js';
import type { WorkspaceInfo } from '../../workspace-store.js';
import type { ChemuxerClient } from '../../chemuxer-client.js';

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

function makeClient(overrides: Partial<ChemuxerClient> = {}): ChemuxerClient {
  return {
    getBuffer: vi.fn().mockResolvedValue('default buffer content'),
    ...overrides,
  } as unknown as ChemuxerClient;
}

async function callGetTerminalOutput(
  store: ReturnType<typeof makeStore>,
  client: ChemuxerClient,
  args: { workspace: string; session_id: string; max_bytes?: number },
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerGetTerminalOutput(server, store, client);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  const result = await mcpClient.callTool({ name: 'get_terminal_output', arguments: args });
  await mcpClient.close();
  await server.close();

  return result;
}

function parseResult(result: Awaited<ReturnType<typeof callGetTerminalOutput>>) {
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

describe('get_terminal_output tool', () => {
  it('returns full content when under max_bytes, truncated: false', async () => {
    const bufferContent = 'hello world\n$ ls\nfile1.txt\nfile2.txt\n';
    const client = makeClient({
      getBuffer: vi.fn().mockResolvedValue(bufferContent),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callGetTerminalOutput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      max_bytes: 1024,
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.content).toBe(bufferContent);
    expect(body.truncated).toBe(false);
    expect(body.workspace_status.workspace_name).toBe('ready-ws');
    expect(body.workspace_status.ready).toBe(true);

    expect(client.getBuffer).toHaveBeenCalledWith('http://10.0.0.1:7681', 'sess-1');
  });

  it('truncates from head, keeping the most recent (tail) content', async () => {
    const bufferContent = 'A'.repeat(150) + 'B'.repeat(50);
    const client = makeClient({
      getBuffer: vi.fn().mockResolvedValue(bufferContent),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callGetTerminalOutput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      max_bytes: 50,
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.content.length).toBe(50);
    expect(body.content).toBe('B'.repeat(50));
    expect(body.truncated).toBe(true);
  });

  it('truncates at a valid UTF-8 boundary keeping the last emoji', async () => {
    const bufferContent = '🙂🙂'; // 8 bytes total, 4 bytes per emoji
    const client = makeClient({
      getBuffer: vi.fn().mockResolvedValue(bufferContent),
    });
    const store = makeStore([readyWorkspace]);

    // max_bytes=5 takes last 5 bytes [3..7]: 1 partial byte + 4 bytes of second emoji
    // UTF-8 safe trim drops the leading partial byte, leaving the second emoji
    const result = await callGetTerminalOutput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
      max_bytes: 5,
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.content).toBe('🙂');
    expect(body.content.includes('�')).toBe(false);
    expect(body.truncated).toBe(true);
  });

  it('uses default max_bytes of 16384 when not provided', async () => {
    const bufferContent = 'B'.repeat(20000);
    const client = makeClient({
      getBuffer: vi.fn().mockResolvedValue(bufferContent),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callGetTerminalOutput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
    });
    expect(result.isError).toBeFalsy();

    const body = parseResult(result);
    expect(body.content.length).toBe(16384);
    expect(body.truncated).toBe(true);
  });

  it('returns WORKSPACE_NOT_FOUND for unknown workspace', async () => {
    const client = makeClient();
    const store = makeStore([readyWorkspace]);

    const result = await callGetTerminalOutput(store, client, {
      workspace: 'no-such-ws',
      session_id: 'sess-1',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('returns UPSTREAM_ERROR for 500 from upstream', async () => {
    const client = makeClient({
      getBuffer: vi.fn().mockRejectedValue(new UpstreamError(500, 'internal server error')),
    });
    const store = makeStore([readyWorkspace]);

    const result = await callGetTerminalOutput(store, client, {
      workspace: 'ready-ws',
      session_id: 'sess-1',
    });
    expect(result.isError).toBe(true);

    const body = parseResult(result);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });
});
