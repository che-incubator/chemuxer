import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { registerListWorkspaces } from '../../tools/list-workspaces.js';
import type { WorkspaceInfo } from '../../workspace-store.js';

function makeStore(entries: WorkspaceInfo[]) {
  return {
    list: () => entries,
    get: (name: string) => entries.find((e) => e.workspace_name === name),
  } as unknown as import('../../workspace-store.js').WorkspaceStore;
}

async function callListWorkspaces(store: ReturnType<typeof makeStore>) {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerListWorkspaces(server, store);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.1' });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const result = await client.callTool({ name: 'list_workspaces', arguments: {} });
  await client.close();
  await server.close();

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

const notReadyWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-3',
  workspace_name: 'pending-ws',
  pod_name: 'pending-ws-pod',
  phase: 'Pending',
  ready: false,
  idled: false,
  endpoint: null,
};

describe('list_workspaces tool', () => {
  it('returns empty workspaces array when store is empty', async () => {
    const result = await callListWorkspaces(makeStore([]));
    expect(result.workspaces).toEqual([]);
  });

  it('returns ready workspace without reason field', async () => {
    const result = await callListWorkspaces(makeStore([readyWorkspace]));
    expect(result.workspaces).toHaveLength(1);
    const ws = result.workspaces[0];
    expect(ws.workspace_name).toBe('ready-ws');
    expect(ws.ready).toBe(true);
    expect(ws.reason).toBeUndefined();
  });

  it('returns idled workspace with reason', async () => {
    const result = await callListWorkspaces(makeStore([idledWorkspace]));
    const ws = result.workspaces[0];
    expect(ws.idled).toBe(true);
    expect(ws.reason).toContain('Workspace is idled');
  });

  it('returns non-ready workspace with reason including phase', async () => {
    const result = await callListWorkspaces(makeStore([notReadyWorkspace]));
    const ws = result.workspaces[0];
    expect(ws.ready).toBe(false);
    expect(ws.reason).toBe('Workspace is not ready (phase: Pending)');
  });
});
